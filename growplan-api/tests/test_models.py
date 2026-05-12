import pytest
from sqlalchemy import select

from app.models.farm import Farm
from app.models.crop import Crop
from app.models.plan import Plan, GridCell, Allocation
from app.models.nursery import NurseryBatch
from app.models.disruption import Disruption
from app.models.action import Action


def test_create_farm(db_session):
    farm = Farm(
        name="Test Farm",
        location="Bangkok",
        rows=4,
        columns=12,
        growing_system="hydroponic",
        nursery_tray_count=30,
        nursery_tray_cells=200,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.commit()
    assert farm.id is not None
    assert farm.rows * farm.columns == 48


def test_create_crop(db_session):
    crop = Crop(
        id="lettuce",
        name="Lettuce",
        category="Leafy Green",
        icon="\U0001f96c",
        accent="#48bb78",
        weeks_on_panel=6,
        nursery_lead_weeks=2,
        yield_per_grid=2.0,
        price_per_kg=3.0,
        seedlings_per_grid=20,
        tray_cell_count=200,
        germination_rate=0.95,
        prefers_edge=False,
        edge_weight=0.5,
        neighbor_bonus=1.0,
    )
    db_session.add(crop)
    db_session.commit()
    assert crop.id == "lettuce"


def test_create_plan_with_cells(db_session):
    farm = Farm(
        name="Test",
        rows=2,
        columns=2,
        nursery_tray_count=10,
        nursery_tray_cells=100,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.flush()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=8,
        status="completed",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.flush()

    cell = GridCell(
        plan_id=plan.id,
        cell_index=0,
        crop_id="lettuce",
        status="planned",
        week_started=0,
        week_harvest_expected=6,
    )
    db_session.add(cell)
    db_session.commit()

    assert plan.id is not None
    assert cell.crop_id == "lettuce"


def test_create_nursery_batch(db_session):
    farm = Farm(
        name="T",
        rows=2,
        columns=2,
        nursery_tray_count=10,
        nursery_tray_cells=100,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.flush()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=8,
        status="solving",
        goal_priority="maximize-revenue",
        selected_crops=["basil"],
    )
    db_session.add(plan)
    db_session.flush()

    batch = NurseryBatch(
        id="basil-w1",
        plan_id=plan.id,
        crop_id="basil",
        seed_week=1,
        transplant_week=3,
        seedling_count=100,
        tray_count=1,
        status="planned",
    )
    db_session.add(batch)
    db_session.commit()

    assert batch.tray_count == 1


def test_create_disruption_and_action(db_session):
    farm = Farm(
        name="T",
        rows=2,
        columns=2,
        nursery_tray_count=10,
        nursery_tray_cells=100,
        nursery_buffer_pct=10,
    )
    db_session.add(farm)
    db_session.flush()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=8,
        status="confirmed",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db_session.add(plan)
    db_session.flush()

    disruption = Disruption(
        plan_id=plan.id,
        type="crop-death",
        grid_indexes=[0, 1],
        crop_id="lettuce",
        week=3,
        description="Root rot",
    )
    action = Action(
        plan_id=plan.id,
        type="transplant",
        priority="this-week",
        week=3,
        crop_id="lettuce",
        grid_indexes=[0, 1],
        description="Transplant lettuce",
        revenue_impact=10.0,
        batch_id="lettuce-w3",
    )
    db_session.add_all([disruption, action])
    db_session.commit()

    assert disruption.id is not None
    assert action.batch_id == "lettuce-w3"
