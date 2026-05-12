"""Tests for the action queue service."""

from app.models.crop import Crop
from app.models.farm import Farm
from app.models.plan import GridCell, Plan
from app.services.actions import generate_action_queue


def _create_confirmed_plan(db):
    farm = Farm(
        name="T",
        rows=2,
        columns=4,
        nursery_tray_count=20,
        nursery_tray_cells=200,
        nursery_buffer_pct=10,
    )
    db.add(farm)
    db.flush()

    db.add(
        Crop(
            id="lettuce",
            name="Lettuce",
            category="Leafy Green",
            icon="L",
            accent="#00ff00",
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
        )
    )
    db.flush()

    plan = Plan(
        farm_id=farm.id,
        horizon_weeks=8,
        status="confirmed",
        goal_priority="maximize-revenue",
        selected_crops=["lettuce"],
    )
    db.add(plan)
    db.flush()
    for i in range(8):
        cell = GridCell(
            plan_id=plan.id,
            cell_index=i,
            crop_id="lettuce",
            status="growing",
            week_started=0,
            week_harvest_expected=5,
        )
        db.add(cell)
    db.commit()
    return plan


def test_action_queue_includes_this_week_tasks(db_session):
    plan = _create_confirmed_plan(db_session)
    actions = generate_action_queue(plan, current_week=5, db=db_session)
    assert len(actions) > 0
    types = {a["type"] for a in actions}
    assert "harvest" in types
