"""Analytics computation service.

Pure functions — no DB access. Computes weekly revenue, cost, profit
arrays and crop comparison metrics from plan data.
"""

from __future__ import annotations

from typing import Any


def compute_analytics(
    cells: list[dict],
    allocations: list[dict],
    crops: list[dict],
    horizon_weeks: int,
    current_week: int,
) -> dict[str, Any]:
    """Compute weekly revenue, cost, and profit arrays."""
    crops_by_id: dict[str, dict] = {c["id"]: c for c in crops}

    # Revenue by week
    revenue_by_week: list[dict[str, float]] = []
    for w in range(1, horizon_weeks + 1):
        entry: dict[str, float] = {"week": w}
        total = 0.0
        for alloc in allocations:
            cid = alloc["crop_id"]
            if alloc["grids_allocated"] == 0:
                continue
            crop = crops_by_id.get(cid)
            if crop and w >= (crop.get("nursery_lead_weeks", 2) + crop.get("weeks_on_panel", 5)):
                entry[cid] = round(alloc["revenue_per_week"], 2)
                total += alloc["revenue_per_week"]
            else:
                entry[cid] = 0.0
        entry["total"] = round(total, 2)
        revenue_by_week.append(entry)

    # Cost by week
    cost_by_week: list[dict[str, float]] = []
    for w in range(1, horizon_weeks + 1):
        labor = 0.0
        nutrients = 0.0
        energy = 0.0
        seeds = 0.0
        for alloc in allocations:
            cid = alloc["crop_id"]
            crop = crops_by_id.get(cid)
            if not crop or alloc["grids_allocated"] == 0:
                continue
            grids = alloc["grids_allocated"]
            nutrients += grids * crop.get("nutrient_cost_per_grid_week", 0.10)
            seeds += (
                grids * crop.get("seedlings_per_grid", 20)
                * crop.get("cost_per_seedling", 0.02)
                / max(crop.get("weeks_on_panel", 6), 1)
            )
        total_grids = sum(a["grids_allocated"] for a in allocations)
        energy = 20.0 + total_grids * 0.50 + 30 * 0.10
        labor = total_grids * 0.20
        total = labor + nutrients + energy + seeds
        cost_by_week.append({
            "week": w,
            "labor": round(labor, 2),
            "nutrients": round(nutrients, 2),
            "energy": round(energy, 2),
            "seeds": round(seeds, 2),
            "total": round(total, 2),
        })

    # Profit by week
    cum_rev = 0.0
    cum_cost = 0.0
    profit_by_week: list[dict[str, float]] = []
    for i in range(horizon_weeks):
        rev = revenue_by_week[i]["total"]
        cost = cost_by_week[i]["total"]
        profit = rev - cost
        margin = round((profit / rev * 100), 1) if rev > 0 else 0
        cum_rev += rev
        cum_cost += cost
        profit_by_week.append({
            "week": i + 1,
            "revenue": round(rev, 2),
            "cost": round(cost, 2),
            "profit": round(profit, 2),
            "margin": margin,
        })

    return {
        "revenueByWeek": revenue_by_week,
        "costByWeek": cost_by_week,
        "profitByWeek": profit_by_week,
        "cumulativeRevenue": round(cum_rev, 2),
        "cumulativeCost": round(cum_cost, 2),
        "cumulativeProfit": round(cum_rev - cum_cost, 2),
    }


def compute_crop_comparison(
    allocations: list[dict],
    crops: list[dict],
) -> dict[str, Any]:
    """Compute per-crop metrics and radar chart scores."""
    crops_by_id: dict[str, dict] = {c["id"]: c for c in crops}
    alloc_by_id: dict[str, dict] = {a["crop_id"]: a for a in allocations}

    crop_results: list[dict[str, Any]] = []
    rev_per_gw: dict[str, float] = {}

    for crop in crops:
        cid = crop["id"]
        alloc = alloc_by_id.get(cid, {"grids_allocated": 0, "sustainable_kg_per_week": 0, "revenue_per_week": 0})
        grids = alloc["grids_allocated"]
        wop = crop["weeks_on_panel"]
        ypg = crop["yield_per_grid"]
        ppk = crop["price_per_kg"]

        revenue_per_gw = (ypg * ppk / wop) if wop > 0 else 0
        rev_per_gw[cid] = revenue_per_gw

        seed_cost = grids * crop.get("seedlings_per_grid", 20) * crop.get("cost_per_seedling", 0.02) if grids > 0 else 0
        cost_per_gw = (
            crop.get("nutrient_cost_per_grid_week", 0.10)
            + seed_cost / max(wop, 1)
        )

        crop_results.append({
            "cropId": cid,
            "cropName": crop.get("name", cid),
            "color": crop.get("accent", "#666"),
            "metrics": {
                "revenuePerGridWeek": round(revenue_per_gw, 2),
                "costPerGridWeek": round(cost_per_gw, 2),
                "netMarginPerGridWeek": round(revenue_per_gw - cost_per_gw, 2),
                "marginPct": round(((revenue_per_gw - cost_per_gw) / revenue_per_gw * 100) if revenue_per_gw > 0 else 0, 1),
                "cycleWeeks": wop,
                "nurseryTraysPerCycle": 1,
                "seedCostPerCycle": round(seed_cost, 2),
            },
            "radarScores": {"revenue": 0, "speed": 0, "yield": 0, "price": 0, "ease": 0},
        })

    # Normalize radar scores 0-100
    if crop_results:
        max_rev = max(rev_per_gw.values()) or 1
        max_yield = max(c["yield_per_grid"] for c in crops) or 1
        max_price = max(c["price_per_kg"] for c in crops) or 1
        weeks = [c["weeks_on_panel"] for c in crops]
        min_w, max_w = min(weeks), max(weeks)
        w_range = (max_w - min_w) or 1

        for i, crop in enumerate(crops):
            cid = crop["id"]
            crop_results[i]["radarScores"] = {
                "revenue": round(rev_per_gw[cid] / max_rev * 100),
                "speed": round((max_w - crop["weeks_on_panel"]) / w_range * 100),
                "yield": round(crop["yield_per_grid"] / max_yield * 100),
                "price": round(crop["price_per_kg"] / max_price * 100),
                "ease": round(crop["germination_rate"] * 100),
            }

    recommended = max(rev_per_gw, key=rev_per_gw.get) if rev_per_gw else ""
    return {"crops": crop_results, "recommended": recommended}
