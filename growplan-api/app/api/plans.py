"""Plan API endpoints.

Provides plan generation (async solve), status polling, retrieval,
and confirmation.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.farm import Farm
from app.models.plan import Allocation, GridCell, Plan
from app.schemas.plan import (
    AllocationResponse,
    GridCellResponse,
    PlanGenerateRequest,
    PlanGenerateResponse,
    PlanResponse,
    PlanStatusResponse,
    RevenueResponse,
)
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
