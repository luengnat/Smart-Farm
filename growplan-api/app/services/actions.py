"""Action queue service.

Generates weekly action items (transplant, harvest, seed-nursery) from a
confirmed plan. Pure data transformation -- no DB writes.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.crop import Crop
from app.models.plan import Plan


def generate_action_queue(
    plan: Plan,
    current_week: int,
    db: Session | None = None,
) -> list[dict[str, Any]]:
    """Generate action items for the current week based on plan state."""
    actions: list[dict[str, Any]] = []
    cells = plan.cells if hasattr(plan, "cells") and plan.cells is not None else []

    crops_by_id: dict[str, Crop] = {}
    if db:
        for c in db.query(Crop).filter(
            Crop.id.in_(plan.selected_crops)
        ).all():
            crops_by_id[c.id] = c

    for cell in cells:
        crop_id = cell.crop_id
        if not crop_id:
            continue

        crop = crops_by_id.get(crop_id)
        if not crop:
            continue

        # Transplant actions for cells starting this week
        if cell.week_started == current_week:
            actions.append(
                {
                    "type": "transplant",
                    "priority": "this-week",
                    "week": current_week,
                    "crop_id": crop_id,
                    "grid_indexes": [cell.cell_index],
                    "description": (
                        f"Transplant {crop_id} to grid {cell.cell_index}"
                    ),
                    "revenue_impact": (
                        crop.yield_per_grid * crop.price_per_kg
                    ),
                }
            )

        # Harvest actions for cells ready to harvest
        if cell.week_harvest_expected == current_week:
            actions.append(
                {
                    "type": "harvest",
                    "priority": "urgent",
                    "week": current_week,
                    "crop_id": crop_id,
                    "grid_indexes": [cell.cell_index],
                    "description": (
                        f"Harvest {crop_id} from grid {cell.cell_index}"
                    ),
                    "revenue_impact": (
                        crop.yield_per_grid * crop.price_per_kg
                    ),
                }
            )

        # Seed nursery for future transplants
        if (
            crop.nursery_lead_weeks
            and current_week + crop.nursery_lead_weeks
            <= plan.horizon_weeks
        ):
            if cell.week_started == current_week + crop.nursery_lead_weeks:
                actions.append(
                    {
                        "type": "seed-nursery",
                        "priority": "this-week",
                        "week": current_week,
                        "crop_id": crop_id,
                        "grid_indexes": [],
                        "description": (
                            f"Seed {crop_id} in nursery for "
                            f"week {cell.week_started} transplant"
                        ),
                        "revenue_impact": 0,
                    }
                )

    # Sort by priority
    priority_order = {"urgent": 0, "this-week": 1, "upcoming": 2}
    actions.sort(key=lambda a: priority_order.get(a["priority"], 3))

    return actions
