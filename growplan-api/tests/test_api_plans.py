"""Tests for Plan API endpoints."""

from app.models.crop import Crop


def create_test_farm(client):
    resp = client.post(
        "/farms",
        json={
            "name": "Test Farm",
            "rows": 4,
            "columns": 12,
            "growingSystem": "hydroponic",
            "nurseryTrayCount": 30,
            "nurseryTrayCells": 200,
            "nurseryBufferPercent": 10,
        },
    )
    return resp.json()


def seed_test_crops(db_session):
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
    ]
    for c in crops:
        db_session.add(c)
    db_session.commit()


def test_generate_plan_returns_job(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    resp = client.post(
        "/plans/generate",
        json={
            "farmId": farm["id"],
            "selectedCropIds": ["lettuce", "basil"],
            "goal": {
                "planningHorizonWeeks": 8,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": False, "minKgPerWeek": 0},
                    "basil": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "solving"
    assert "planId" in data
    assert "pollUrl" in data


def test_get_plan_status(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    resp = client.post(
        "/plans/generate",
        json={
            "farmId": farm["id"],
            "selectedCropIds": ["lettuce"],
            "goal": {
                "planningHorizonWeeks": 8,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    plan_id = resp.json()["planId"]
    status_resp = client.get(f"/plans/{plan_id}/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] in ("solving", "completed")


def test_get_completed_plan(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    resp = client.post(
        "/plans/generate",
        json={
            "farmId": farm["id"],
            "selectedCropIds": ["lettuce"],
            "goal": {
                "planningHorizonWeeks": 8,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    plan_id = resp.json()["planId"]
    plan = client.get(f"/plans/{plan_id}").json()
    assert plan["status"] == "completed"
    assert len(plan["cells"]) == 48  # 4x12 farm


def test_confirm_plan(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    gen = client.post(
        "/plans/generate",
        json={
            "farmId": farm["id"],
            "selectedCropIds": ["lettuce"],
            "goal": {
                "planningHorizonWeeks": 8,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    plan_id = gen.json()["planId"]
    resp = client.post(f"/plans/{plan_id}/confirm")
    assert resp.status_code == 200
    assert client.get(f"/plans/{plan_id}").json()["status"] == "confirmed"


def test_confirm_locked_plan_rejected(client, db_session):
    farm = create_test_farm(client)
    seed_test_crops(db_session)
    gen = client.post(
        "/plans/generate",
        json={
            "farmId": farm["id"],
            "selectedCropIds": ["lettuce"],
            "goal": {
                "planningHorizonWeeks": 8,
                "priority": "maximize-revenue",
                "commitments": {
                    "lettuce": {"enabled": False, "minKgPerWeek": 0},
                },
            },
        },
    )
    plan_id = gen.json()["planId"]
    client.post(f"/plans/{plan_id}/confirm")
    resp = client.post(f"/plans/{plan_id}/confirm")
    assert resp.status_code == 409
