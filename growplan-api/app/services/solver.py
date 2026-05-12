"""CP-SAT solver service for farm plan optimization."""

import time
from collections import defaultdict
from math import sqrt

from ortools.sat.python import cp_model


def _edge_distance(row: int, col: int, rows: int, cols: int) -> int:
    """Minimum distance from (row, col) to the nearest edge. Scaled by 10."""
    return min(row, rows - 1 - row, col, cols - 1 - col) * 10


def _grid_index(row: int, col: int, cols: int) -> int:
    return row * cols + col


def _row_col(index: int, cols: int) -> tuple[int, int]:
    return index // cols, index % cols


def _neighbor_indices(row: int, col: int, rows: int, cols: int) -> list[int]:
    """Return grid indices of orthogonal neighbors."""
    neighbors = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            neighbors.append(_grid_index(nr, nc, cols))
    return neighbors


def build_model(
    farm: dict,
    crops: list[dict],
    goal: dict,
    excluded_grids: set[int] | None = None,
) -> tuple[cp_model.CpModel, dict]:
    """Build a CP-SAT model for farm plan optimization.

    Returns the model and a context dict holding variable references and
    metadata needed for result extraction.

    excluded_grids: grid indexes that must not be assigned (e.g. dead grids).
    """
    model = cp_model.CpModel()

    rows = farm["rows"]
    cols = farm["columns"]
    total_grids = rows * cols
    horizon = goal["planning_horizon_weeks"]
    priority = goal.get("priority", "maximize-revenue")
    commitments = goal.get("commitments", {})
    nursery_total_trays = farm["nursery_tray_count"]

    crop_ids = [c["id"] for c in crops]
    crop_map: dict[str, dict] = {c["id"]: c for c in crops}
    excluded = excluded_grids or set()

    # ---- Decision variables ----

    # x[crop_id, grid, week] = 1 if crop occupies grid that week
    x: dict[tuple[str, int, int], cp_model.IntVar] = {}
    for crop in crops:
        cid = crop["id"]
        for g in range(total_grids):
            for w in range(horizon):
                x[cid, g, w] = model.NewBoolVar(f"x_{cid}_{g}_{w}")

    # s[crop_id, grid, start_week] = 1 if crop is planted at grid starting start_week
    s: dict[tuple[str, int, int], cp_model.IntVar] = {}
    for crop in crops:
        cid = crop["id"]
        wp = crop["weeks_on_panel"]
        for g in range(total_grids):
            for w in range(horizon):
                if w + wp <= horizon:
                    s[cid, g, w] = model.NewBoolVar(f"s_{cid}_{g}_{w}")

    # n[crop_id, week] = number of nursery trays seeded this week
    n: dict[tuple[str, int], cp_model.IntVar] = {}
    for crop in crops:
        cid = crop["id"]
        for w in range(horizon):
            n[cid, w] = model.NewIntVar(0, nursery_total_trays, f"n_{cid}_{w}")

    # ---- Constraints ----

    # 0. Fix excluded grids to zero (dead/unavailable cells).
    for g in excluded:
        for cid in crop_ids:
            for w in range(horizon):
                if (cid, g, w) in x:
                    model.Add(x[cid, g, w] == 0)
            for w in range(horizon):
                if (cid, g, w) in s:
                    model.Add(s[cid, g, w] == 0)

    # 1. Link start variables to occupancy variables.
    #    If s[c, g, w] = 1, then x[c, g, w'] = 1 for all w' in [w, w+weeks_on_panel-1]
    for crop in crops:
        cid = crop["id"]
        wp = crop["weeks_on_panel"]
        for g in range(total_grids):
            for w in range(horizon):
                if w + wp <= horizon:
                    for offset in range(wp):
                        model.AddImplication(
                            s[cid, g, w], x[cid, g, w + offset]
                        )
                else:
                    # Cannot start a crop that would exceed the horizon
                    # Still create the s var (it was already created above only when valid)
                    pass

    # 2. Occupancy must be explained by a start event.
    #    If x[c, g, w] = 1, at least one s[c, g, w-start] must be 1 where
    #    w - start < weeks_on_panel.
    for crop in crops:
        cid = crop["id"]
        wp = crop["weeks_on_panel"]
        for g in range(total_grids):
            for w in range(horizon):
                possible_starts = []
                for sw in range(max(0, w - wp + 1), min(w + 1, horizon)):
                    if sw + wp <= horizon and (cid, g, sw) in s:
                        possible_starts.append(s[cid, g, sw])
                if possible_starts:
                    # x=1 => at least one start is 1
                    model.Add(sum(possible_starts) >= 1).OnlyEnforceIf(
                        x[cid, g, w]
                    )

    # 3. At most one start per grid (a grid can only begin one crop cycle).
    for g in range(total_grids):
        all_starts = []
        for crop in crops:
            cid = crop["id"]
            wp = crop["weeks_on_panel"]
            for w in range(horizon):
                if w + wp <= horizon and (cid, g, w) in s:
                    all_starts.append(s[cid, g, w])
        model.Add(sum(all_starts) <= 1)

    # 4. Grid exclusivity: at most one crop per grid per week.
    for g in range(total_grids):
        for w in range(horizon):
            model.Add(sum(x[cid, g, w] for cid in crop_ids) <= 1)

    # 5. Nursery tray capacity per week.
    buffer_pct = int(farm.get("nursery_buffer_pct", 0))
    effective_trays = max(
        1, nursery_total_trays - (nursery_total_trays * buffer_pct // 100)
    )
    for w in range(horizon):
        # Sum trays across all crops for this week
        model.Add(sum(n[cid, w] for cid in crop_ids) <= effective_trays)

    # 6. Link nursery seeding to planting: sum nursery trays required across
    #    all grids starting a crop in a given week.
    for crop in crops:
        cid = crop["id"]
        lead = crop["nursery_lead_weeks"]
        seedlings_per_grid = crop["seedlings_per_grid"]
        tray_cells = crop["tray_cell_count"]
        germ = crop["germination_rate"]
        # Trays needed per grid = ceil(seedlings / (tray_cells * germ))
        trays_per_grid = max(
            1,
            int(
                (seedlings_per_grid + tray_cells * germ - 1)
                // (tray_cells * germ)
            ),
        )
        wp = crop["weeks_on_panel"]
        for w in range(horizon):
            if w + wp > horizon:
                continue
            if w - lead >= 0:
                # Sum of start variables for this crop at this transplant week
                starts_this_week = [
                    s[cid, g, w]
                    for g in range(total_grids)
                    if (cid, g, w) in s
                ]
                if starts_this_week:
                    model.Add(
                        n[cid, w - lead]
                        >= trays_per_grid * sum(starts_this_week)
                    )

    # ---- Objective components ----

    revenue_terms: list[cp_model.LinearExpr] = []
    spatial_penalty_terms: list[cp_model.LinearExpr] = []

    # Revenue contribution — accumulate only at start variables so each
    # planting cycle contributes once (not per grid-week of occupancy).
    for crop in crops:
        cid = crop["id"]
        rev_coeff = int(crop["yield_per_grid"] * crop["price_per_kg"] * 10)
        for g in range(total_grids):
            wp = crop["weeks_on_panel"]
            for w in range(horizon):
                if w + wp <= horizon and (cid, g, w) in s:
                    revenue_terms.append(rev_coeff * s[cid, g, w])

    # Spatial scoring: edge preference and neighbor bonus
    for crop in crops:
        cid = crop["id"]
        prefers_edge = crop.get("prefers_edge", False)
        edge_w = crop.get("edge_weight", 0.5)
        neighbor_bonus_w = crop.get("neighbor_bonus", 1.0)

        for g in range(total_grids):
            r, c = _row_col(g, cols)
            # Edge distance penalty (crop prefers edge = penalize interior)
            if prefers_edge:
                dist = _edge_distance(r, c, rows, cols)
                penalty = int(dist * edge_w)
                for w in range(horizon):
                    if (cid, g, w) in x:
                        spatial_penalty_terms.append(penalty * x[cid, g, w])

            # Neighbor bonus: reward same-crop adjacency
            if neighbor_bonus_w > 0:
                for ni in _neighbor_indices(r, c, rows, cols):
                    if ni > g:  # avoid double-counting
                        for w in range(horizon):
                            if (cid, g, w) in x and (cid, ni, w) in x:
                                bonus = int(neighbor_bonus_w * 10)
                                # Create a helper variable: both = x[g] AND x[neighbor]
                                both = model.NewBoolVar(
                                    f"adj_{cid}_{g}_{ni}_{w}"
                                )
                                model.Add(
                                    x[cid, g, w] + x[cid, ni, w] >= 2
                                ).OnlyEnforceIf(both)
                                model.Add(
                                    x[cid, g, w] + x[cid, ni, w] <= 1
                                ).OnlyEnforceIf(both.Not())
                                spatial_penalty_terms.append(-bonus * both)

    # Commitment constraints: hard lower bounds + soft penalty for objective
    commitment_penalty_terms: list[cp_model.LinearExpr] = []
    for crop in crops:
        cid = crop["id"]
        wp = crop["weeks_on_panel"]
        yield_per_grid = crop["yield_per_grid"]
        comm = commitments.get(cid, {})
        if not comm.get("enabled", False):
            continue
        min_kg = comm.get("min_kg_per_week", 0)
        if min_kg <= 0:
            continue

        # sustainable_kg_per_week = total_grids_for_crop * yield / weeks_on_panel
        # Count grids assigned to this crop.
        grid_assigned: dict[int, cp_model.IntVar] = {}
        for g in range(total_grids):
            grid_assigned[g] = model.NewBoolVar(f"ga_{cid}_{g}")
            # grid_assigned[g] = 1 if crop occupies g in any week
            any_week = [x[cid, g, w] for w in range(horizon)]
            model.AddMaxEquality(grid_assigned[g], any_week)

        total_grids_crop = sum(grid_assigned[g] for g in range(total_grids))

        # sustainable_kg scaled by 10: grids * yield * 10 / weeks_on_panel
        scale = 10
        target_scaled = int(min_kg * wp * scale)
        achieved_scaled = sum(
            int(yield_per_grid * scale) * grid_assigned[g]
            for g in range(total_grids)
        )

        # HARD constraint: must meet the commitment target
        # This makes the model INFEASIBLE when the farm cannot produce enough
        model.Add(achieved_scaled >= target_scaled)

        # Soft penalty for objective (adds pressure to exceed minimum)
        shortfall = model.NewIntVar(0, target_scaled + 1, f"short_{cid}")
        model.Add(shortfall >= target_scaled - achieved_scaled)
        model.Add(shortfall >= 0)
        commitment_penalty_terms.append(100 * shortfall)

    # ---- Set objective ----
    if priority == "minimize-stockout":
        # Primary: minimize stockout (maximize coverage)
        # Coverage: maximize total grid-weeks of occupancy
        coverage_terms = []
        for crop in crops:
            cid = crop["id"]
            for g in range(total_grids):
                for w in range(horizon):
                    coverage_terms.append(x[cid, g, w])

        stockout_penalty = sum(-100 * t for t in coverage_terms)
        revenue_secondary = sum(-3 * t for t in revenue_terms)  # 0.3 weight
        objective = (
            stockout_penalty
            + revenue_secondary
            + sum(spatial_penalty_terms)
            + sum(commitment_penalty_terms)
        )
        model.Minimize(objective)
    else:
        # maximize-revenue
        objective = (
            sum(-t for t in revenue_terms)  # negate for minimization
            + sum(spatial_penalty_terms)  # already signed
            + sum(commitment_penalty_terms)
        )
        model.Minimize(objective)

    context = {
        "model": model,
        "x": x,
        "s": s,
        "n": n,
        "crops": crops,
        "crop_ids": crop_ids,
        "crop_map": crop_map,
        "rows": rows,
        "cols": cols,
        "total_grids": total_grids,
        "horizon": horizon,
        "priority": priority,
        "commitments": commitments,
        "grid_assigned_vars": None,  # only for commitment extraction
    }

    return model, context


def solve_plan(
    farm: dict,
    crops: list[dict],
    goal: dict,
    timeout_seconds: int = 10,
    excluded_grids: set[int] | None = None,
) -> dict:
    """Solve the farm plan optimization problem.

    Returns a result dict with status, cells, allocations, and metrics.
    """
    start_time = time.monotonic()

    model, ctx = build_model(farm, crops, goal, excluded_grids=excluded_grids)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = timeout_seconds
    # Use multiple workers for faster solving
    solver.parameters.num_workers = 4

    status = solver.Solve(model)
    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    status_name = solver.StatusName(status)

    if status == cp_model.INFEASIBLE:
        return {
            "status": "INFEASIBLE",
            "conflicting_constraints": [
                "Farm capacity insufficient for required commitments"
            ],
            "solver_time_ms": elapsed_ms,
        }

    if status == cp_model.MODEL_INVALID:
        return {
            "status": "NO_SOLUTION_FOUND",
            "solver_time_ms": elapsed_ms,
        }

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "NO_SOLUTION_FOUND",
            "solver_time_ms": elapsed_ms,
        }

    # ---- Extract results inline ----

    x_vars = ctx["x"]
    s_vars = ctx["s"]
    crop_map = ctx["crop_map"]
    crop_ids = ctx["crop_ids"]
    total_grids = ctx["total_grids"]
    horizon = ctx["horizon"]
    rows = ctx["rows"]
    cols = ctx["cols"]

    # Extract cells: find which crop is assigned to each grid
    cells: list[dict] = []
    for g in range(total_grids):
        assigned_crop = None
        start_week = None
        for cid in crop_ids:
            crop = crop_map[cid]
            wp = crop["weeks_on_panel"]
            for w in range(horizon):
                if w + wp <= horizon and (cid, g, w) in s_vars:
                    if solver.Value(s_vars[cid, g, w]) == 1:
                        assigned_crop = cid
                        start_week = w
                        break
            if assigned_crop:
                break

        if assigned_crop and start_week is not None:
            crop = crop_map[assigned_crop]
            cells.append(
                {
                    "cell_index": g,
                    "crop_id": assigned_crop,
                    "status": "active",
                    "week_started": start_week,
                    "week_harvest_expected": start_week + crop["weeks_on_panel"],
                }
            )

    # Aggregate per-crop allocations
    crop_grid_counts: dict[str, list[int]] = defaultdict(list)
    for cell in cells:
        crop_grid_counts[cell["crop_id"]].append(cell["cell_index"])

    allocations: list[dict] = []
    for cid in crop_ids:
        grids = crop_grid_counts.get(cid, [])
        num_grids = len(grids)
        crop = crop_map[cid]
        wp = crop["weeks_on_panel"]
        yield_per_grid = crop["yield_per_grid"]
        price = crop["price_per_kg"]

        if num_grids > 0 and wp > 0:
            sustainable_kg = (num_grids * yield_per_grid) / wp
        else:
            sustainable_kg = 0.0

        revenue = sustainable_kg * price

        allocations.append(
            {
                "crop_id": cid,
                "grids_allocated": num_grids,
                "sustainable_kg_per_week": round(sustainable_kg, 4),
                "revenue_per_week": round(revenue, 4),
            }
        )

    # Also include crops with zero allocation
    for cid in crop_ids:
        if not any(a["crop_id"] == cid for a in allocations):
            allocations.append(
                {
                    "crop_id": cid,
                    "grids_allocated": 0,
                    "sustainable_kg_per_week": 0.0,
                    "revenue_per_week": 0.0,
                }
            )

    return {
        "status": status_name,
        "cells": cells,
        "allocations": allocations,
        "total_grids": total_grids,
        "solver_time_ms": elapsed_ms,
    }
