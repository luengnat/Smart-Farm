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
