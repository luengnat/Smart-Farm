"""Tests for the replanner service."""

from app.models.crop import Crop
from app.models.disruption import Disruption
from app.models.farm import Farm
from app.models.plan import GridCell, Plan
from app.services.replanner import replan


def _create_farm(db):
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
    return farm


def _create_crops(db):
    for data in [
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
        ),
        Crop(
            id="basil",
            name="Basil",
            category="Herb",
            icon="B",
            accent="#00cc00",
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
    ]:
        db.add(data)
    db.flush()


def _create_completed_plan(db, farm_id, crop_ids):
    plan = Plan(
        farm_id=farm_id,
        horizon_weeks=8,
        status="completed",
        goal_priority="maximize-revenue",
        selected_crops=crop_ids,
    )
    db.add(plan)
    db.flush()
    for i in range(8):
        crop = crop_ids[i % len(crop_ids)]
        cell = GridCell(
            plan_id=plan.id,
            cell_index=i,
            crop_id=crop,
            status="planned",
            week_started=0,
            week_harvest_expected=5 if crop == "lettuce" else 6,
        )
        db.add(cell)
    db.flush()
    return plan


def test_replan_marks_dead_grids(db_session):
    farm = _create_farm(db_session)
    _create_crops(db_session)
    plan = _create_completed_plan(db_session, farm.id, ["lettuce", "basil"])
    disruption = Disruption(
        plan_id=plan.id,
        type="crop-death",
        grid_indexes=[0, 1],
        crop_id="lettuce",
        week=2,
        description="Root rot",
    )
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    dead_cells = [c for c in result["cells"] if c["cell_index"] in [0, 1]]
    assert all(c["status"] == "dead" for c in dead_cells)


def test_replan_preserves_past_weeks(db_session):
    farm = _create_farm(db_session)
    _create_crops(db_session)
    plan = _create_completed_plan(db_session, farm.id, ["lettuce"])
    plan.current_week = 3
    db_session.commit()
    disruption = Disruption(
        plan_id=plan.id,
        type="crop-death",
        grid_indexes=[0],
        crop_id="lettuce",
        week=3,
    )
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")


def test_replan_returns_replant_options(db_session):
    farm = _create_farm(db_session)
    _create_crops(db_session)
    plan = _create_completed_plan(db_session, farm.id, ["lettuce", "basil"])
    disruption = Disruption(
        plan_id=plan.id,
        type="crop-death",
        grid_indexes=[0, 1],
        crop_id="lettuce",
        week=2,
    )
    db_session.add(disruption)
    db_session.commit()
    result = replan(plan.id, disruption, db_session)
    assert "replant_options" in result
    assert len(result["replant_options"]) >= 1
    assert result["replant_options"][0]["crop_id"] is not None
