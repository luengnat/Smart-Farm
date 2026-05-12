"""Tests for PlanSnapshot model and creation logic."""

import pytest
from app.models.snapshot import PlanSnapshot


def test_snapshot_model_fields():
    """PlanSnapshot should have all required fields."""
    s = PlanSnapshot(
        plan_id=1,
        snapshot_type="confirmed",
        grid_data=[{"cell_index": 0, "crop_id": "lettuce"}],
        allocations=[{"crop_id": "lettuce", "grids_allocated": 2}],
        revenue={"total_per_week": 4.0},
    )
    assert s.plan_id == 1
    assert s.snapshot_type == "confirmed"
    assert s.grid_data[0]["crop_id"] == "lettuce"


def test_create_snapshot_on_confirm(client, db_session):
    """Confirming a plan should create a snapshot with type='confirmed'."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell, Allocation

    farm = Farm(
        name="S", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="completed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.add(Allocation(
        plan_id=plan.id, crop_id="lettuce", grids_allocated=1,
        sustainable_kg_per_week=0.24, revenue_per_week=0.96,
    ))
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/confirm")
    assert resp.status_code == 200

    snapshots = db_session.query(PlanSnapshot).filter(
        PlanSnapshot.plan_id == plan.id
    ).all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_type == "confirmed"
    assert len(snapshots[0].grid_data) == 1
    assert snapshots[0].grid_data[0]["crop_id"] == "lettuce"


def test_create_snapshot_on_advance_week(client, db_session):
    """Advancing a week should create a snapshot with type='week-advanced'."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="AW", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.post(f"/plans/{plan.id}/advance-week")
    assert resp.status_code == 200

    snapshots = db_session.query(PlanSnapshot).filter(
        PlanSnapshot.plan_id == plan.id
    ).all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_type == "week-advanced"


def test_get_analytics_not_found(client):
    resp = client.get("/plans/99999/analytics")
    assert resp.status_code == 404


def test_get_timeline_not_found(client):
    resp = client.get("/plans/99999/timeline")
    assert resp.status_code == 404


def test_get_history_not_found(client):
    resp = client.get("/plans/99999/history")
    assert resp.status_code == 404


def test_get_compare_not_found(client):
    resp = client.get("/plans/99999/compare")
    assert resp.status_code == 404


def test_export_not_found(client):
    resp = client.get("/plans/99999/export")
    assert resp.status_code == 404


def test_get_history_empty(client, db_session):
    """History for a plan with no snapshots returns empty list."""
    from app.models.farm import Farm
    from app.models.plan import Plan

    farm = Farm(
        name="H", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()
    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="completed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/history")
    assert resp.status_code == 200
    data = resp.json()
    assert data["snapshots"] == []
    assert data["total"] == 0


def test_farm_plans_not_found(client):
    """GET /farms/99999/plans returns 404 for nonexistent farm."""
    resp = client.get("/farms/99999/plans")
    assert resp.status_code == 404


def test_analytics_with_data(client, db_session):
    """GET /plans/{id}/analytics returns revenue/cost/profit arrays."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell, Allocation

    farm = Farm(
        name="A", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.add(Allocation(
        plan_id=plan.id, crop_id="lettuce", grids_allocated=1,
        sustainable_kg_per_week=0.24, revenue_per_week=0.96,
    ))
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["revenueByWeek"]) == 10
    assert len(data["costByWeek"]) == 10
    assert len(data["profitByWeek"]) == 10
    assert data["cumulativeRevenue"] >= 0


def test_timeline_with_data(client, db_session):
    """GET /plans/{id}/timeline returns crop intervals."""
    from app.models.farm import Farm
    from app.models.plan import Plan, GridCell
    from app.models.crop import Crop

    crop = Crop(
        id="lettuce", name="Lettuce", category="Leafy Green", icon="🥬",
        accent="#4ade80", weeks_on_panel=5, nursery_lead_weeks=2,
        yield_per_grid=0.24, price_per_kg=4.0, seedlings_per_grid=10,
        tray_cell_count=200, germination_rate=0.9, prefers_edge=0,
        edge_weight=0.5, neighbor_bonus=1.0, cost_per_seedling=0.15,
        nutrient_cost_per_grid_week=0.08,
    )
    db_session.add(crop)
    db_session.commit()

    farm = Farm(
        name="T", location="B", rows=1, columns=2,
        growing_system="hydroponic", nursery_tray_count=30,
        nursery_tray_cells=200, nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()

    plan = Plan(
        farm_id=farm.id, horizon_weeks=10, status="confirmed",
        goal_priority="maximize-revenue", selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.commit()

    db_session.add(GridCell(
        plan_id=plan.id, cell_index=0, crop_id="lettuce",
        status="planned", week_started=1, week_harvest_expected=6,
    ))
    db_session.commit()

    resp = client.get(f"/plans/{plan.id}/timeline")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["crops"]) >= 1
    assert data["currentWeek"] == 1
    assert data["horizonWeeks"] == 10
