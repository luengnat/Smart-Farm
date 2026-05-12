"""Plan API endpoints.

Provides plan generation (async solve), status polling, retrieval,
and confirmation.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.disruption import Disruption
from app.models.farm import Farm
from app.models.nursery import NurseryBatch
from app.models.plan import Allocation, GridCell, Plan
from app.schemas.disruption import DisruptionRequest
from app.schemas.plan import (
    AllocationResponse,
    GridCellResponse,
    PlanGenerateRequest,
    PlanGenerateResponse,
    PlanResponse,
    PlanStatusResponse,
    RevenueResponse,
)
from app.services.nursery import build_occupancy
from app.workers.solver_worker import run_solver

router = APIRouter(prefix="/plans", tags=["plans"])


def _is_test_mode() -> bool:
    return os.environ.get("GP_TEST_MODE", "").lower() in ("true", "1", "yes")


@router.post("/generate", response_model=PlanGenerateResponse, status_code=202)
def generate_plan(
    req: PlanGenerateRequest,
    db: Session = Depends(get_db),
):
    farm = db.query(Farm).filter(Farm.id == req.farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    commitments_raw = req.goal.commitments
    commitments_data = {
        k: v.model_dump() for k, v in commitments_raw.items()
    }

    plan = Plan(
        farm_id=req.farm_id,
        horizon_weeks=req.goal.planning_horizon_weeks,
        status="solving",
        goal_priority=req.goal.priority,
        selected_crops=req.selected_crop_ids,
        goal_commitments=commitments_data,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    if _is_test_mode():
        run_solver(plan.id, db=db)
    else:
        import redis
        from rq import Queue

        q = Queue(connection=redis.from_url(settings.redis_url))
        q.enqueue(run_solver, plan.id)

    return PlanGenerateResponse(
        plan_id=plan.id,
        status="solving",
        poll_url=f"/plans/{plan.id}/status",
    )


@router.get("/{plan_id}/status", response_model=PlanStatusResponse)
def get_plan_status(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return PlanStatusResponse(
        plan_id=plan.id,
        status=plan.status,
        solver_status=plan.solver_status,
        solver_time_ms=plan.solver_time_ms,
        error_message=plan.error_message,
    )


@router.get("/{plan_id}", response_model=PlanResponse)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    cells = db.query(GridCell).filter(GridCell.plan_id == plan.id).all()
    allocations = (
        db.query(Allocation).filter(Allocation.plan_id == plan.id).all()
    )

    revenue = None
    if plan.revenue_total is not None:
        revenue_by_crop = {a.crop_id: a.revenue_per_week for a in allocations}
        revenue = RevenueResponse(
            total_per_week=plan.revenue_total,
            max_possible=plan.revenue_max or 0,
            revenue_gap=plan.revenue_gap or 0,
            revenue_by_crop=revenue_by_crop,
            opportunity_cost=plan.revenue_opportunity_cost or 0,
        )

    return PlanResponse(
        id=plan.id,
        status=plan.status,
        rows=farm.rows if farm else None,
        columns=farm.columns if farm else None,
        total_grids=plan.total_grids,
        cells=[
            GridCellResponse(
                index=c.cell_index,
                crop_id=c.crop_id,
                status=c.status,
                week_started=c.week_started,
                week_harvest_expected=c.week_harvest_expected,
            )
            for c in cells
        ],
        allocations=[
            AllocationResponse(
                crop_id=a.crop_id,
                grids_allocated=a.grids_allocated,
                sustainable_kg_per_week=a.sustainable_kg_per_week,
                revenue_per_week=a.revenue_per_week,
            )
            for a in allocations
        ],
        revenue=revenue,
        horizon_weeks=plan.horizon_weeks,
        current_week=plan.current_week,
        goal_priority=plan.goal_priority,
        selected_crops=plan.selected_crops or [],
    )


@router.post("/{plan_id}/confirm")
def confirm_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status == "confirmed":
        raise HTTPException(status_code=409, detail="Plan already confirmed")
    if plan.status != "completed":
        raise HTTPException(
            status_code=400, detail="Can only confirm completed plans"
        )
    plan.status = "confirmed"
    db.commit()
    return {"status": "confirmed", "plan_id": plan.id}


@router.post("/{plan_id}/advance-week")
def advance_week(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.status != "confirmed":
        raise HTTPException(
            status_code=400, detail="Can only advance confirmed plans"
        )
    plan.current_week += 1
    db.commit()
    return {"current_week": plan.current_week}


@router.post("/{plan_id}/disrupt")
def create_disruption(
    plan_id: int,
    req: DisruptionRequest,
    db: Session = Depends(get_db),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    disruption = Disruption(
        plan_id=plan_id,
        type=req.type,
        grid_indexes=req.grid_indexes,
        crop_id=req.crop_id,
        week=req.week,
        description=req.description,
    )
    db.add(disruption)
    plan.status = "disrupted"
    db.commit()
    return {"id": disruption.id, "status": "disrupted"}


@router.post("/{plan_id}/replan")
def replan_endpoint(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    disruption = (
        db.query(Disruption)
        .filter(Disruption.plan_id == plan_id)
        .order_by(Disruption.id.desc())
        .first()
    )
    if not disruption:
        raise HTTPException(
            status_code=400, detail="No disruption found for this plan"
        )
    from app.services.replanner import replan as do_replan

    result = do_replan(plan_id, disruption, db)
    return result


@router.get("/{plan_id}/actions")
def get_actions(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    from app.services.actions import generate_action_queue

    actions = generate_action_queue(plan, plan.current_week, db)
    return {"actions": actions}


@router.get("/{plan_id}/costs")
def get_costs(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    allocations = (
        db.query(Allocation).filter(Allocation.plan_id == plan_id).all()
    )
    from app.models.crop import Crop as CropModel

    crops = (
        db.query(CropModel)
        .filter(CropModel.id.in_(plan.selected_crops))
        .all()
    )

    from app.services.actions import generate_action_queue
    from app.services.cost import calculate_weekly_costs

    actions = generate_action_queue(plan, plan.current_week, db)
    action_inputs = [
        {
            "type": a["type"],
            "minutes_per_grid": 8,
            "grids": len(a.get("grid_indexes", [1])),
        }
        for a in actions
    ]

    alloc_inputs = [
        {"crop_id": a.crop_id, "grids_allocated": a.grids_allocated}
        for a in allocations
    ]
    crop_inputs = [
        {
            "id": c.id,
            "seedlings_per_grid": c.seedlings_per_grid,
            "nutrient_cost_per_grid_week": c.nutrient_cost_per_grid_week,
            "cost_per_seedling": c.cost_per_seedling,
            "weeks_on_panel": c.weeks_on_panel,
        }
        for c in crops
    ]
    farm_config = {
        "nursery_tray_count": farm.nursery_tray_count if farm else 30,
        "hourly_rate": 15.0,
        "base_energy_weekly": 20.0,
        "energy_per_grid": 0.50,
        "energy_per_tray": 0.10,
    }

    result = calculate_weekly_costs(
        actions=action_inputs,
        allocations=alloc_inputs,
        farm_config=farm_config,
        crops=crop_inputs,
        revenue_per_week=plan.revenue_total or 0,
    )
    return result


@router.get("/{plan_id}/nursery")
def get_nursery(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    batches = (
        db.query(NurseryBatch)
        .filter(NurseryBatch.plan_id == plan_id)
        .all()
    )
    batch_dicts = [
        {
            "id": b.id,
            "crop_id": b.crop_id,
            "seed_week": b.seed_week,
            "transplant_week": b.transplant_week,
            "seedling_count": b.seedling_count,
            "tray_count": b.tray_count,
            "status": b.status,
        }
        for b in batches
    ]
    occupancy = build_occupancy(
        batch_dicts, farm.nursery_tray_count, plan.horizon_weeks
    )
    return {
        "plan_id": plan_id,
        "occupancy": occupancy,
        "batches": [
            {
                "id": b.id,
                "crop_id": b.crop_id,
                "seed_week": b.seed_week,
                "transplant_week": b.transplant_week,
                "seedling_count": b.seedling_count,
                "tray_count": b.tray_count,
                "status": b.status,
            }
            for b in batches
        ],
    }
