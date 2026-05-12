"""Tests for API error paths — plan not found, invalid inputs, edge cases."""

import pytest


def _create_farm(client):
    resp = client.post(
        "/farms",
        json={
            "name": "Error Test Farm",
            "location": "Bangkok",
            "rows": 2,
            "columns": 3,
            "growingSystem": "hydroponic",
            "nurseryTrayCount": 30,
            "nurseryTrayCells": 200,
            "nurseryBufferPercent": 10,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_get_plan_not_found(client):
    resp = client.get("/plans/99999")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_plan_status_not_found(client):
    resp = client.get("/plans/99999/status")
    assert resp.status_code == 404


def test_confirm_plan_not_found(client):
    resp = client.post("/plans/99999/confirm")
    assert resp.status_code == 404


def test_advance_week_not_found(client):
    resp = client.post("/plans/99999/advance-week")
    assert resp.status_code == 404


def test_disrupt_plan_not_found(client):
    resp = client.post(
        "/plans/99999/disrupt",
        json={
            "type": "crop-death",
            "grid_indexes": [0],
            "crop_id": "lettuce",
            "week": 3,
            "description": "test",
        },
    )
    assert resp.status_code == 404


def test_replan_plan_not_found(client):
    resp = client.post("/plans/99999/replan")
    assert resp.status_code == 404


def test_actions_plan_not_found(client):
    resp = client.get("/plans/99999/actions")
    assert resp.status_code == 404


def test_nursery_plan_not_found(client):
    resp = client.get("/plans/99999/nursery")
    assert resp.status_code == 404


def test_costs_plan_not_found(client):
    resp = client.get("/plans/99999/costs")
    assert resp.status_code == 404


def test_replan_without_disruption(client, db_session):
    """Replan should fail with 400 if no disruption exists for the plan."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="R",
        location="B",
        rows=2,
        columns=2,
        growing_system="hydroponic",
        nursery_tray_count=30,
        nursery_tray_cells=200,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=10,
        status="confirmed",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/replan")
    assert resp.status_code == 400
    assert "no disruption" in resp.json()["detail"].lower()


def test_generate_plan_farm_not_found(client):
    """Generating a plan for a nonexistent farm should return 404."""
    resp = client.post(
        "/plans/generate",
        json={
            "farmId": 99999,
            "selectedCropIds": ["lettuce"],
            "goal": {
                "planningHorizonWeeks": 10,
                "priority": "maximize-revenue",
                "commitments": {},
            },
        },
    )
    assert resp.status_code == 404


def test_confirm_non_completed_plan(client, db_session):
    """Only completed plans can be confirmed."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="X",
        location="B",
        rows=2,
        columns=2,
        growing_system="hydroponic",
        nursery_tray_count=30,
        nursery_tray_cells=200,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=10,
        status="solving",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/confirm")
    assert resp.status_code == 400


def test_advance_week_non_confirmed_plan(client, db_session):
    """Only confirmed plans can advance weeks."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="Y",
        location="B",
        rows=2,
        columns=2,
        growing_system="hydroponic",
        nursery_tray_count=30,
        nursery_tray_cells=200,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=10,
        status="completed",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/advance-week")
    assert resp.status_code == 400
