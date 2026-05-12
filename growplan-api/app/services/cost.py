"""Weekly cost calculation service.

Pure data transformation -- no DB access. Computes labor, nutrient,
energy, and seed costs from plan action/allocation/crop inputs.
"""

from __future__ import annotations


def calculate_weekly_costs(
    actions: list[dict],
    allocations: list[dict],
    farm_config: dict,
    crops: list[dict],
    revenue_per_week: float = 0,
) -> dict:
    """Calculate weekly operating costs.

    Returns dict with: labor, nutrients, energy, seeds, total,
    profit, margin_pct, cost_by_crop.
    """
    crops_by_id: dict[str, dict] = {c["id"]: c for c in crops}
    total_grids = sum(a["grids_allocated"] for a in allocations)

    # Labor: sum of (minutes_per_grid * grids / 60) * hourly_rate
    labor = 0.0
    for action in actions:
        minutes = action.get("minutes_per_grid", 8)
        grids = action.get("grids", 1)
        labor += (minutes * grids / 60) * farm_config.get("hourly_rate", 15.0)

    # Nutrients: sum of grids * nutrient_cost_per_grid_week for each crop
    nutrients = 0.0
    for alloc in allocations:
        crop = crops_by_id.get(alloc["crop_id"])
        if crop:
            nutrients += (
                alloc["grids_allocated"]
                * crop.get("nutrient_cost_per_grid_week", 0.10)
            )

    # Energy: base + (total_grids * per_grid) + (nursery_trays * per_tray)
    energy = (
        farm_config.get("base_energy_weekly", 20.0)
        + total_grids * farm_config.get("energy_per_grid", 0.50)
        + farm_config.get("nursery_tray_count", 30)
        * farm_config.get("energy_per_tray", 0.10)
    )

    # Seeds: (grids * seedlings_per_grid * cost_per_seedling) / weeks_on_panel
    # Rotation cost spread across weeks
    seeds = 0.0
    for alloc in allocations:
        crop = crops_by_id.get(alloc["crop_id"])
        if crop:
            seedlings = (
                alloc["grids_allocated"] * crop.get("seedlings_per_grid", 20)
            )
            seeds += (
                seedlings * crop.get("cost_per_seedling", 0.02)
            ) / crop.get("weeks_on_panel", 6)

    total = labor + nutrients + energy + seeds
    profit = revenue_per_week - total
    margin_pct = (
        (profit / revenue_per_week * 100) if revenue_per_week > 0 else 0
    )

    # Cost breakdown by crop (nutrients + seed amortization)
    cost_by_crop: dict[str, float] = {}
    for alloc in allocations:
        crop = crops_by_id.get(alloc["crop_id"])
        if crop:
            crop_cost = (
                alloc["grids_allocated"]
                * crop.get("nutrient_cost_per_grid_week", 0.10)
                + alloc["grids_allocated"]
                * crop.get("seedlings_per_grid", 20)
                * crop.get("cost_per_seedling", 0.02)
                / crop.get("weeks_on_panel", 6)
            )
            cost_by_crop[alloc["crop_id"]] = round(crop_cost, 2)

    return {
        "labor": round(labor, 2),
        "nutrients": round(nutrients, 2),
        "energy": round(energy, 2),
        "seeds": round(seeds, 2),
        "total": round(total, 2),
        "profit": round(profit, 2),
        "margin_pct": round(margin_pct, 1),
        "cost_by_crop": cost_by_crop,
    }
