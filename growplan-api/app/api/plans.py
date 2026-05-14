"""Plan API endpoints.

Provides plan generation (async solve), status polling, retrieval,
and confirmation.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import get_current_user
from app.database import get_db
from app.models.disruption import Disruption
from app.models.farm import Farm
from app.models.farm_member import FarmMember
from app.models.nursery import NurseryBatch
from app.models.action import Action
from app.models.plan import Allocation, GridCell, Plan
from app.models.snapshot import PlanSnapshot
from app.models.user import User
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
from app.schemas.analytics import (
    AnalyticsResponse,
    CompareResponse,
    HistoryResponse,
    SnapshotSummary,
    TimelineResponse,
)
from app.services.analytics import compute_analytics, compute_crop_comparison

router = APIRouter(prefix="/plans", tags=["plans"])


def _verify_plan_access(plan_id: int, user: User, db: Session) -> Plan:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    membership = (
        db.query(FarmMember)
        .filter(FarmMember.user_id == user.id, FarmMember.farm_id == plan.farm_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this plan")
    return plan


def _is_test_mode() -> bool:
    return os.environ.get("GP_TEST_MODE", "").lower() in ("true", "1", "yes")


def _create_snapshot(plan: Plan, snapshot_type: str, db: Session) -> None:
    """Serialize current plan state into a PlanSnapshot."""
    cells = db.query(GridCell).filter(GridCell.plan_id == plan.id).all()
    allocations = (
        db.query(Allocation).filter(Allocation.plan_id == plan.id).all()
    )
    snapshot = PlanSnapshot(
        plan_id=plan.id,
        snapshot_type=snapshot_type,
        grid_data=[
            {
                "cell_index": c.cell_index,
                "crop_id": c.crop_id,
                "status": c.status,
                "week_started": c.week_started,
                "week_harvest_expected": c.week_harvest_expected,
            }
            for c in cells
        ],
        allocations=[
            {
                "crop_id": a.crop_id,
                "grids_allocated": a.grids_allocated,
                "sustainable_kg_per_week": a.sustainable_kg_per_week,
                "revenue_per_week": a.revenue_per_week,
            }
            for a in allocations
        ],
        revenue={
            "total_per_week": plan.revenue_total or 0,
            "revenue_gap": plan.revenue_gap or 0,
        },
    )
    db.add(snapshot)


def _persist_actions(plan: Plan, db: Session) -> None:
    """Clear current-week actions and regenerate from plan state."""
    db.query(Action).filter(
        Action.plan_id == plan.id, Action.week == plan.current_week
    ).delete()
    from app.services.actions import generate_action_queue

    queue = generate_action_queue(plan, plan.current_week, db)
    for item in queue:
        db.add(Action(
            plan_id=plan.id,
            type=item["type"],
            priority=item["priority"],
            week=item["week"],
            crop_id=item.get("crop_id"),
            grid_indexes=item.get("grid_indexes"),
            description=item["description"],
            revenue_impact=item.get("revenue_impact", 0),
            batch_id=item.get("batch_id"),
        ))


@router.post("/generate", response_model=PlanGenerateResponse, status_code=202)
def generate_plan(
    req: PlanGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm = db.query(Farm).filter(Farm.id == req.farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    membership = (
        db.query(FarmMember)
        .filter(FarmMember.user_id == current_user.id, FarmMember.farm_id == req.farm_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this farm")

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
def get_plan_status(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
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
def get_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

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
        levels=getattr(farm, "levels", 1) if farm else 1,
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
def confirm_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
    if plan.status == "confirmed":
        raise HTTPException(status_code=409, detail="Plan already confirmed")
    if plan.status != "completed":
        raise HTTPException(
            status_code=400, detail="Can only confirm completed plans"
        )
    _create_snapshot(plan, "confirmed", db)
    _persist_actions(plan, db)
    plan.status = "confirmed"
    db.commit()
    return {"status": "confirmed", "plan_id": plan.id}


@router.post("/{plan_id}/advance-week")
def advance_week(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
    if plan.status != "confirmed":
        raise HTTPException(
            status_code=400, detail="Can only advance confirmed plans"
        )
    # Re-query with row lock to prevent concurrent advance race
    plan = db.query(Plan).filter(Plan.id == plan_id).with_for_update().first()
    _create_snapshot(plan, "week-advanced", db)
    plan.current_week += 1
    _persist_actions(plan, db)
    db.commit()
    return {"current_week": plan.current_week}


@router.post("/{plan_id}/disrupt")
def create_disruption(
    plan_id: int,
    req: DisruptionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _verify_plan_access(plan_id, current_user, db)
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
def replan_endpoint(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
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
    _create_snapshot(plan, "replanned", db)
    from app.services.replanner import replan as do_replan

    result = do_replan(plan_id, disruption, db)
    return result


@router.get("/{plan_id}/actions")
def get_actions(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
    actions = (
        db.query(Action)
        .filter(Action.plan_id == plan.id, Action.week == plan.current_week)
        .order_by(Action.priority, Action.id)
        .all()
    )
    return {
        "actions": [
            {
                "id": a.id,
                "type": a.type,
                "priority": a.priority,
                "week": a.week,
                "cropId": a.crop_id,
                "gridIndexes": a.grid_indexes,
                "description": a.description,
                "revenueImpact": a.revenue_impact,
                "batchId": a.batch_id,
                "completed": a.completed,
            }
            for a in actions
        ],
        "currentWeek": plan.current_week,
    }


@router.patch("/{plan_id}/actions/{action_id}")
def toggle_action(
    plan_id: int,
    action_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_plan_access(plan_id, current_user, db)
    action = db.query(Action).filter(Action.id == action_id, Action.plan_id == plan_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    action.completed = not action.completed
    db.commit()
    return {"id": action.id, "completed": action.completed}


@router.get("/{plan_id}/costs")
def get_costs(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

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
def get_nursery(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)
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


@router.get("/{plan_id}/analytics", response_model=AnalyticsResponse)
def get_analytics(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    allocations = db.query(Allocation).filter(Allocation.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()

    cell_dicts = [
        {"cell_index": c.cell_index, "crop_id": c.crop_id, "status": c.status,
         "week_started": c.week_started, "week_harvest_expected": c.week_harvest_expected}
        for c in cells
    ]
    alloc_dicts = [
        {"crop_id": a.crop_id, "grids_allocated": a.grids_allocated,
         "sustainable_kg_per_week": a.sustainable_kg_per_week, "revenue_per_week": a.revenue_per_week}
        for a in allocations
    ]
    crop_dicts = [
        {"id": c.id, "name": c.name, "accent": c.accent, "weeks_on_panel": c.weeks_on_panel,
         "nursery_lead_weeks": c.nursery_lead_weeks, "yield_per_grid": c.yield_per_grid,
         "price_per_kg": c.price_per_kg, "seedlings_per_grid": c.seedlings_per_grid,
         "germination_rate": c.germination_rate, "cost_per_seedling": c.cost_per_seedling,
         "nutrient_cost_per_grid_week": c.nutrient_cost_per_grid_week}
        for c in crops
    ]

    return compute_analytics(
        cells=cell_dicts, allocations=alloc_dicts, crops=crop_dicts,
        horizon_weeks=plan.horizon_weeks, current_week=plan.current_week,
    )


@router.get("/{plan_id}/timeline", response_model=TimelineResponse)
def get_timeline(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()
    crop_map = {c.id: c for c in crops}

    from collections import defaultdict
    crop_intervals: dict[str, list] = defaultdict(list)
    for c in cells:
        if c.crop_id and c.week_started is not None and c.week_harvest_expected is not None:
            crop_intervals[c.crop_id].append({
                "cellIndex": c.cell_index,
                "startWeek": c.week_started,
                "endWeek": c.week_harvest_expected - 1,
                "phase": "growing",
            })
            crop_intervals[c.crop_id].append({
                "cellIndex": c.cell_index,
                "startWeek": c.week_harvest_expected - 1,
                "endWeek": c.week_harvest_expected,
                "phase": "harvest",
            })

    timeline_crops = []
    for cid in plan.selected_crops:
        crop_obj = crop_map.get(cid)
        if crop_obj:
            timeline_crops.append({
                "cropId": cid,
                "cropName": crop_obj.name,
                "color": crop_obj.accent,
                "intervals": crop_intervals.get(cid, []),
            })

    return TimelineResponse(
        crops=timeline_crops,
        current_week=plan.current_week,
        horizon_weeks=plan.horizon_weeks,
    )


@router.get("/{plan_id}/history", response_model=HistoryResponse)
def get_history(
    plan_id: int,
    page: int = 1,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _verify_plan_access(plan_id, current_user, db)

    query = db.query(PlanSnapshot).filter(PlanSnapshot.plan_id == plan_id)
    total = query.count()
    snapshots = (
        query.order_by(PlanSnapshot.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return HistoryResponse(
        snapshots=[
            SnapshotSummary(
                id=s.id,
                snapshot_type=s.snapshot_type,
                total_grids=len(s.grid_data),
                crop_count=len(set(
                    c["crop_id"] for c in s.grid_data if c.get("crop_id")
                )),
                revenue_per_week=s.revenue.get("total_per_week", 0),
                created_at=s.created_at.isoformat() if s.created_at else "",
            )
            for s in snapshots
        ],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{plan_id}/compare", response_model=CompareResponse)
def get_crop_comparison(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

    allocations = db.query(Allocation).filter(Allocation.plan_id == plan_id).all()
    from app.models.crop import Crop as CropModel
    crops = db.query(CropModel).filter(CropModel.id.in_(plan.selected_crops)).all()

    alloc_dicts = [
        {"crop_id": a.crop_id, "grids_allocated": a.grids_allocated,
         "sustainable_kg_per_week": a.sustainable_kg_per_week, "revenue_per_week": a.revenue_per_week}
        for a in allocations
    ]
    crop_dicts = [
        {"id": c.id, "name": c.name, "accent": c.accent, "weeks_on_panel": c.weeks_on_panel,
         "yield_per_grid": c.yield_per_grid, "price_per_kg": c.price_per_kg,
         "seedlings_per_grid": c.seedlings_per_grid, "germination_rate": c.germination_rate,
         "cost_per_seedling": c.cost_per_seedling, "nutrient_cost_per_grid_week": c.nutrient_cost_per_grid_week}
        for c in crops
    ]
    return compute_crop_comparison(allocations=alloc_dicts, crops=crop_dicts)


@router.get("/{plan_id}/export")
def export_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _verify_plan_access(plan_id, current_user, db)

    cells = db.query(GridCell).filter(GridCell.plan_id == plan_id).all()
    from fastapi.responses import Response
    lines = ["Grid Index,Crop,Status,Week Started,Week Harvest Expected"]
    for c in sorted(cells, key=lambda x: x.cell_index):
        lines.append(
            f"{c.cell_index},{c.crop_id or ''},{c.status},"
            f"{c.week_started or ''},{c.week_harvest_expected or ''}"
        )
    csv_content = "\n".join(lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename=plan-{plan_id}-week-{plan.current_week}.csv"
            )
        },
    )
