"""Background solver worker.

Runs the CP-SAT solver for a plan and persists results to the database.
In production, this would be dispatched to a task queue (Celery, RQ, etc.).
In test mode, it runs synchronously.
"""

import time

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.crop import Crop
from app.models.farm import Farm
from app.models.nursery import NurseryBatch
from app.models.plan import Allocation, GridCell, Plan
from app.services.nursery import build_batches
from app.services.postprocess import calculate_revenue
from app.services.solver import solve_plan


def run_solver(plan_id: int, db: Session | None = None) -> None:
    """Solve the plan and persist results to the database.

    When *db* is provided (test mode), it is reused so that changes
    are visible within the same test session / transaction.
    Otherwise a fresh session is created from SessionLocal.
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        plan = db.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            return

        farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
        if not farm:
            plan.status = "failed"
            plan.error_message = "Farm not found"
            db.commit()
            return
        crops = db.query(Crop).filter(Crop.id.in_(plan.selected_crops)).all()

        farm_dict = {
            "rows": farm.rows,
            "columns": farm.columns,
            "nursery_tray_count": int(farm.nursery_tray_count),
            "nursery_tray_cells": int(farm.nursery_tray_cells),
            "nursery_buffer_pct": float(farm.nursery_buffer_pct),
        }
        crops_list = [
            {
                "id": c.id,
                "weeks_on_panel": c.weeks_on_panel,
                "nursery_lead_weeks": c.nursery_lead_weeks,
                "yield_per_grid": c.yield_per_grid,
                "price_per_kg": c.price_per_kg,
                "seedlings_per_grid": c.seedlings_per_grid,
                "tray_cell_count": c.tray_cell_count,
                "germination_rate": c.germination_rate,
                "prefers_edge": c.prefers_edge,
                "edge_weight": c.edge_weight,
                "neighbor_bonus": c.neighbor_bonus,
            }
            for c in crops
        ]
        goal_dict = {
            "planning_horizon_weeks": plan.horizon_weeks,
            "priority": plan.goal_priority,
            "commitments": plan.goal_commitments or {},
        }

        start = time.time()
        result = solve_plan(farm_dict, crops_list, goal_dict)
        elapsed_ms = int((time.time() - start) * 1000)

        plan.solver_time_ms = elapsed_ms
        plan.solver_status = result["status"]

        if result["status"] in ("OPTIMAL", "FEASIBLE"):
            plan.status = "completed"
            plan.total_grids = result["total_grids"]

            for cell_data in result["cells"]:
                cell = GridCell(
                    plan_id=plan.id,
                    cell_index=cell_data["cell_index"],
                    crop_id=cell_data["crop_id"],
                    status="planned",
                    week_started=cell_data["week_started"],
                    week_harvest_expected=cell_data["week_harvest_expected"],
                )
                db.add(cell)

            for alloc_data in result["allocations"]:
                alloc = Allocation(
                    plan_id=plan.id,
                    crop_id=alloc_data["crop_id"],
                    grids_allocated=alloc_data["grids_allocated"],
                    sustainable_kg_per_week=alloc_data["sustainable_kg_per_week"],
                    revenue_per_week=alloc_data["revenue_per_week"],
                )
                db.add(alloc)

            revenue = calculate_revenue(
                result["allocations"],
                result["total_grids"],
                crops_list,
                plan.goal_commitments or {},
            )
            plan.revenue_total = revenue["total_per_week"]
            plan.revenue_max = revenue["max_possible"]
            plan.revenue_efficiency = revenue["efficiency_pct"]
            plan.revenue_opportunity_cost = revenue["opportunity_cost_of_commitments"]
            plan.revenue_gap = revenue["revenue_gap"]

            batches = build_batches(
                result["allocations"],
                crops_list,
                plan.horizon_weeks,
                farm.nursery_buffer_pct,
            )
            for batch_data in batches:
                batch = NurseryBatch(
                    id=batch_data["id"],
                    plan_id=plan.id,
                    crop_id=batch_data["crop_id"],
                    seed_week=batch_data["seed_week"],
                    transplant_week=batch_data["transplant_week"],
                    seedling_count=batch_data["seedling_count"],
                    tray_count=batch_data["tray_count"],
                    status="planned",
                )
                db.add(batch)
        else:
            plan.status = "failed"
            plan.error_message = f"Solver returned {result['status']}"
            if "conflicting_constraints" in result:
                plan.error_message += f": {result['conflicting_constraints']}"

        db.commit()
    except Exception as e:
        db.rollback()
        plan = db.query(Plan).filter(Plan.id == plan_id).first()
        if plan:
            plan.status = "failed"
            plan.error_message = str(e)
            db.commit()
    finally:
        if own_session:
            db.close()
