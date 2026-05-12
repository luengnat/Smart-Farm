"""Post-processing service for solver output.

Transforms raw solver results into structured cells, allocations,
and revenue summaries. All functions are pure -- no DB access.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


def extract_cells(
    solver_cells: list[dict[str, Any]],
    rows: int,
    cols: int,
) -> list[dict[str, Any]]:
    """Validate and return cell assignments from solver output.

    Parameters
    ----------
    solver_cells:
        Flat cell list produced by the solver, each with keys
        ``cell_index``, ``crop_id``, ``status``, ``week_started``,
        ``week_harvest_expected``.
    rows, cols:
        Farm grid dimensions.

    Returns
    -------
    list[dict]
        Validated list of cell dicts with the same structure.
    """
    expected_total = rows * cols
    index_map: dict[int, dict[str, Any]] = {
        c["cell_index"]: {
            "cell_index": c["cell_index"],
            "crop_id": c["crop_id"],
            "status": c["status"],
            "week_started": c["week_started"],
            "week_harvest_expected": c["week_harvest_expected"],
        }
        for c in solver_cells
    }

    cells: list[dict[str, Any]] = []
    for i in range(expected_total):
        if i in index_map:
            cells.append(index_map[i])
        else:
            cells.append(
                {
                    "cell_index": i,
                    "crop_id": None,
                    "status": "empty",
                    "week_started": None,
                    "week_harvest_expected": None,
                }
            )
    return cells


def extract_allocations(
    cells: list[dict[str, Any]],
    crops: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group cells by crop and compute per-crop allocation metrics.

    Parameters
    ----------
    cells:
        Output of :func:`extract_cells`.
    crops:
        Crop parameter dicts (must contain ``id``, ``yield_per_grid``,
        ``price_per_kg``, ``weeks_on_panel``).

    Returns
    -------
    list[dict]
        Each element has ``crop_id``, ``grids_allocated``,
        ``sustainable_kg_per_week``, ``revenue_per_week``.
    """
    crop_map: dict[str, dict[str, Any]] = {c["id"]: c for c in crops}

    grid_counts: dict[str, int] = defaultdict(int)
    for cell in cells:
        cid = cell.get("crop_id")
        if cid is not None:
            grid_counts[cid] += 1

    # Include every crop, even those with zero allocation.
    allocations: list[dict[str, Any]] = []
    for crop in crops:
        cid = crop["id"]
        grids = grid_counts.get(cid, 0)
        yield_per_grid = crop["yield_per_grid"]
        price = crop["price_per_kg"]
        weeks_on_panel = crop["weeks_on_panel"]

        if grids > 0 and weeks_on_panel > 0:
            sustainable_kg = (grids * yield_per_grid) / weeks_on_panel
        else:
            sustainable_kg = 0.0

        revenue_per_week = sustainable_kg * price

        allocations.append(
            {
                "crop_id": cid,
                "grids_allocated": grids,
                "sustainable_kg_per_week": round(sustainable_kg, 4),
                "revenue_per_week": round(revenue_per_week, 4),
            }
        )
    return allocations


def calculate_revenue(
    allocations: list[dict[str, Any]],
    total_grids: int,
    crops: list[dict[str, Any]],
    commitments: dict[str, Any],
) -> dict[str, Any]:
    """Compute revenue summary from allocations.

    Parameters
    ----------
    allocations:
        Output of :func:`extract_allocations`.
    total_grids:
        Total number of grids on the farm.
    crops:
        Crop parameter dicts.
    commitments:
        Commitment configuration (currently unused beyond the shape).

    Returns
    -------
    dict with ``total_per_week``, ``max_possible``, ``efficiency_pct``,
    ``revenue_gap``, ``revenue_by_crop``, ``opportunity_cost_of_commitments``.
    """
    crop_map: dict[str, dict[str, Any]] = {c["id"]: c for c in crops}

    total_per_week = round(
        sum(a["revenue_per_week"] for a in allocations), 4
    )

    # Maximum possible revenue: all grids assigned to the highest-revenue crop.
    # This is a theoretical upper bound -- it must be at least as high as
    # the actual total_per_week (you cannot do worse than what you achieved).
    best_weekly_rev = 0.0
    for crop in crops:
        wp = crop.get("weeks_on_panel", 1)
        if wp <= 0:
            continue
        sustainable = (total_grids * crop["yield_per_grid"]) / wp
        rev = sustainable * crop["price_per_kg"]
        if rev > best_weekly_rev:
            best_weekly_rev = rev
    max_possible = round(max(best_weekly_rev, total_per_week), 4)

    if max_possible > 0:
        efficiency_pct = round((total_per_week / max_possible) * 100, 2)
    else:
        efficiency_pct = 100.0

    revenue_gap = round(max_possible - total_per_week, 4)

    revenue_by_crop = {
        a["crop_id"]: a["revenue_per_week"] for a in allocations
    }

    opportunity_cost_of_commitments = round(max_possible - total_per_week, 4)

    return {
        "total_per_week": total_per_week,
        "max_possible": max_possible,
        "efficiency_pct": efficiency_pct,
        "revenue_gap": revenue_gap,
        "revenue_by_crop": revenue_by_crop,
        "opportunity_cost_of_commitments": opportunity_cost_of_commitments,
    }
