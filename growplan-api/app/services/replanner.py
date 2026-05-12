"""Replanner service.

Re-optimizes a plan after a disruption by re-running the solver with dead
grids marked as unavailable and generating replant options.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.models.farm import Farm
from app.models.plan import GridCell, Plan
from app.services.solver import solve_plan


def replan(
    plan_id: int, disruption: Any, db: Session
) -> dict[str, Any]:
    """Re-optimize a plan after a disruption.

    - Marks dead grids as unavailable
    - Fixes past weeks (keeps their assignments)
    - Re-runs solver for remaining weeks
    - Returns new plan with replant options
    """
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    farm = db.query(Farm).filter(Farm.id == plan.farm_id).first()
    crops = db.query(Crop).filter(Crop.id.in_(plan.selected_crops)).all()

    # Dead grid indexes from the disruption
    dead_indexes = set(disruption.grid_indexes)

    # Build solver input dicts
    farm_dict = {
        "rows": farm.rows,
        "columns": farm.columns,
        "nursery_tray_count": farm.nursery_tray_count,
        "nursery_tray_cells": farm.nursery_tray_cells,
        "nursery_buffer_pct": farm.nursery_buffer_pct,
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

    result = solve_plan(farm_dict, crops_list, goal_dict)

    if result["status"] in ("OPTIMAL", "FEASIBLE"):
        # Mark dead cells
        for cell in result["cells"]:
            if cell["cell_index"] in dead_indexes:
                cell["status"] = "dead"
                cell["crop_id"] = None

        # Generate replant options for crops other than the disrupted one
        replant_options = []
        for c in crops_list:
            if c["id"] != disruption.crop_id:
                replant_options.append(
                    {
                        "crop_id": c["id"],
                        "description": (
                            f"{c['id']} — {c['weeks_on_panel']}-week cycle"
                        ),
                        "revenue_recovered": (
                            c["yield_per_grid"]
                            * c["price_per_kg"]
                            * len(dead_indexes)
                        ),
                        "weeks_until_harvest": c["weeks_on_panel"],
                        "seedlings_available": True,
                        "recommended": c["id"] == crops_list[0]["id"],
                    }
                )

        result["replant_options"] = replant_options
        result["grids_changed"] = len(dead_indexes)

        # Revenue delta: lost revenue from dead grids
        disrupted_crop = next(
            (c for c in crops if c.id == disruption.crop_id), None
        )
        if disrupted_crop and dead_indexes:
            result["revenue_delta_per_week"] = -(
                disrupted_crop.yield_per_grid
                * disrupted_crop.price_per_kg
                * len(dead_indexes)
            )
        else:
            result["revenue_delta_per_week"] = 0

        result["nursery_impact"] = f"{len(dead_indexes)} grids freed"

    return result
