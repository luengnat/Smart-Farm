"""End-to-end integration test for the full plan lifecycle.

Exercises: create farm -> seed crops -> generate plan -> poll status
-> get plan -> confirm -> advance week -> get actions -> get nursery
-> get costs -> disrupt -> replan.
"""

from app.models.crop import Crop


def _create_farm(client):
    resp = client.post(
        "/farms",
        json={
            "name": "Integration Farm",
            "location": "Bangkok",
            "rows": 4,
            "columns": 12,
            "growingSystem": "hydroponic",
            "nurseryTrayCount": 30,
            "nurseryTrayCells": 200,
            "nurseryBufferPercent": 10,
        },
    )
    assert resp.status_code == 201
    return resp.json()


def _seed_crops(db_session):
    crops = [
        Crop(
            id="lettuce",
            name="Lettuce",
            category="Leafy Green",
            icon="L",
            accent="#9edb66",
            weeks_on_panel=5,
            nursery_lead_weeks=2,
            yield_per_grid=1.2,
            price_per_kg=4.0,
            seedlings_per_grid=80,
            tray_cell_count=200,
            germination_rate=0.95,
            prefers_edge=True,
            edge_weight=1.1,
            neighbor_bonus=2.0,
            nutrient_cost_per_grid_week=0.10,
            cost_per_seedling=0.02,
        ),
        Crop(
            id="basil",
            name="Basil",
            category="Herb",
            icon="B",
            accent="#86c56a",
            weeks_on_panel=6,
            nursery_lead_weeks=2,
            yield_per_grid=0.6,
            price_per_kg=12.0,
            seedlings_per_grid=100,
            tray_cell_count=200,
            germination_rate=0.90,
            prefers_edge=False,
            edge_weight=0.9,
            neighbor_bonus=2.8,
            nutrient_cost_per_grid_week=0.12,
            cost_per_seedling=0.03,
        ),
        Crop(
            id="mint",
            name="Mint",
            category="Herb",
            icon="M",
            accent="#73d0a8",
            weeks_on_panel=8,
            nursery_lead_weeks=2,
            yield_per_grid=0.5,
            price_per_kg=8.0,
            seedlings_per_grid=100,
            tray_cell_count=200,
            germination_rate=0.88,
            prefers_edge=False,
            edge_weight=0.0,
            neighbor_bonus=3.2,
            nutrient_cost_per_grid_week=0.08,
            cost_per_seedling=0.02,
        ),
    ]
    for c in crops:
        db_session.merge(c)
    db_session.commit()


def test_full_plan_lifecycle(client, db_session):
    # 1. Create farm
    farm = _create_farm(client)
    farm_id = farm["id"]
    assert farm["rows"] == 4
    assert farm["columns"] == 12

    # 2. Seed crops
    _seed_crops(db_session)

    # 3. Generate plan
    gen_resp = client.post(
        "/plans/generate",
        json={
            "farmId": farm_id,
            "selectedCropIds": ["lettuce", "basil", "mint"],
            "goal": {
                "planningHorizonWeeks": 12,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": True, "minKgPerWeek": 5.0},
                    "basil": {"enabled": False, "minKgPerWeek": 0},
                    "mint": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    assert gen_resp.status_code == 202
    plan_id = gen_resp.json()["planId"]

    # 4. Get plan status (should be completed in test mode)
    status_resp = client.get(f"/plans/{plan_id}/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "completed"

    # 5. Get full plan
    plan_resp = client.get(f"/plans/{plan_id}")
    assert plan_resp.status_code == 200
    plan = plan_resp.json()
    assert plan["status"] == "completed"
    assert plan["totalGrids"] == 48
    assert len(plan["cells"]) == 48
    assert len(plan["allocations"]) >= 1

    # 6. Confirm plan
    confirm_resp = client.post(f"/plans/{plan_id}/confirm")
    assert confirm_resp.status_code == 200
    assert client.get(f"/plans/{plan_id}").json()["status"] == "confirmed"

    # 7. Advance week
    advance_resp = client.post(f"/plans/{plan_id}/advance-week")
    assert advance_resp.status_code == 200
    assert advance_resp.json()["current_week"] == 2

    # 8. Get actions
    actions_resp = client.get(f"/plans/{plan_id}/actions")
    assert actions_resp.status_code == 200
    assert "actions" in actions_resp.json()

    # 9. Get nursery
    nursery_resp = client.get(f"/plans/{plan_id}/nursery")
    assert nursery_resp.status_code == 200
    assert "occupancy" in nursery_resp.json()

    # 10. Get costs
    costs_resp = client.get(f"/plans/{plan_id}/costs")
    assert costs_resp.status_code == 200
    costs = costs_resp.json()
    assert costs["labor"] >= 0
    assert costs["total"] >= 0

    # 11. Report disruption
    disrupt_resp = client.post(
        f"/plans/{plan_id}/disrupt",
        json={
            "type": "crop-death",
            "gridIndexes": [0, 1],
            "cropId": "lettuce",
            "week": 2,
            "description": "Root rot in zone A",
        },
    )
    assert disrupt_resp.status_code == 200

    # 12. Replan
    replan_resp = client.post(f"/plans/{plan_id}/replan")
    assert replan_resp.status_code == 200
    replan_data = replan_resp.json()
    assert replan_data["status"] in ("OPTIMAL", "FEASIBLE")
    assert "replant_options" in replan_data
    assert replan_data["replant_options"][0]["crop_id"] is not None
