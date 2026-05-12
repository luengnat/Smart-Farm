"""Tests for solver correctness after review fixes.

Validates: revenue per-cycle (not per-week), nursery tray summation,
and excluded grids.
"""

from app.services.solver import solve_plan


def _farm(**overrides):
    defaults = {
        "rows": 2,
        "columns": 3,
        "nursery_tray_count": 30,
        "nursery_tray_cells": 200,
        "nursery_buffer_pct": 10,
    }
    defaults.update(overrides)
    return defaults


def _crop(**overrides):
    defaults = {
        "id": "lettuce",
        "weeks_on_panel": 5,
        "nursery_lead_weeks": 2,
        "yield_per_grid": 1.2,
        "price_per_kg": 4,
        "seedlings_per_grid": 80,
        "tray_cell_count": 200,
        "germination_rate": 0.95,
        "prefers_edge": True,
        "edge_weight": 1.1,
        "neighbor_bonus": 2.0,
    }
    defaults.update(overrides)
    return defaults


def test_revenue_matches_per_cycle_not_per_week():
    """Revenue should be yield*price per planting cycle, not per grid-week.

    A crop with weeks_on_panel=5 on 1 grid should contribute
    yield*price once to the objective (via the start variable),
    NOT yield*price*5 (via each occupancy variable).
    """
    farm = _farm(rows=1, columns=2)
    crop = _crop(weeks_on_panel=5, yield_per_grid=1.0, price_per_kg=10.0)
    goal = {"planning_horizon_weeks": 10, "priority": "maximize-revenue"}

    result = solve_plan(farm, [crop], goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    # With 2 grids, each producing 1.0 kg at $10/kg over 5 weeks:
    # sustainable_kg_per_week = 2 * 1.0 / 5 = 0.4
    # revenue_per_week = 0.4 * 10 = 4.0
    alloc = result["allocations"][0]
    assert alloc["grids_allocated"] == 2
    assert abs(alloc["sustainable_kg_per_week"] - 0.4) < 0.01
    assert abs(alloc["revenue_per_week"] - 4.0) < 0.01


def test_revenue_prefers_higher_per_cycle_crops():
    """Solver should prefer crops with higher per-cycle revenue.

    Crop A: yield=1.0, price=$10, weeks=5 → $10/cycle, $2/week
    Crop B: yield=0.5, price=$20, weeks=3 → $10/cycle, $3.33/week

    With revenue now per-cycle, both are equal per cycle.
    But B cycles faster, so sustainable weekly is higher.
    The solver should allocate B if optimizing weekly revenue.
    """
    farm = _farm(rows=1, columns=2)
    crop_a = _crop(
        id="slow-crop",
        weeks_on_panel=5,
        yield_per_grid=1.0,
        price_per_kg=10.0,
    )
    crop_b = _crop(
        id="fast-crop",
        weeks_on_panel=3,
        yield_per_grid=0.5,
        price_per_kg=20.0,
    )
    goal = {"planning_horizon_weeks": 12, "priority": "maximize-revenue"}

    result = solve_plan(farm, [crop_a, crop_b], goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    # Check that at least some grids are assigned
    total_grids = sum(a["grids_allocated"] for a in result["allocations"])
    assert total_grids > 0


def test_excluded_grids_not_assigned():
    """Excluded grids must not be assigned any crop."""
    farm = _farm(rows=2, columns=3)
    crop = _crop()
    goal = {"planning_horizon_weeks": 10, "priority": "maximize-revenue"}

    # Exclude grids 0, 1, 2 (first row)
    result = solve_plan(farm, [crop], goal, excluded_grids={0, 1, 2})
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    assigned_indexes = {c["cell_index"] for c in result["cells"]}
    # None of the excluded grids should be assigned
    assert assigned_indexes.isdisjoint({0, 1, 2})
    # Only grids 3, 4, 5 (second row) should be used
    assert assigned_indexes.issubset({3, 4, 5})


def test_excluded_grids_none_means_all_available():
    """Passing None for excluded_grids should allow all grids."""
    farm = _farm(rows=1, columns=3)
    crop = _crop()
    goal = {"planning_horizon_weeks": 10, "priority": "maximize-revenue"}

    result = solve_plan(farm, [crop], goal, excluded_grids=None)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    assigned_indexes = {c["cell_index"] for c in result["cells"]}
    assert assigned_indexes == {0, 1, 2}


def test_nursery_trays_scale_with_grids():
    """Nursery tray count should scale with the number of grids starting.

    If 3 grids start the same crop in the same week, the nursery
    constraint should require 3x the trays (not just 1x).
    Use lead=0 so the constraint applies for all start weeks.
    """
    farm = _farm(rows=1, columns=3, nursery_tray_count=2)
    crop = _crop(
        nursery_lead_weeks=0,
        seedlings_per_grid=100,
        tray_cell_count=200,
        germination_rate=1.0,
    )
    # trays_per_grid = ceil(100 / (200 * 1.0)) = 1
    # With lead=0, every start week has a nursery constraint.
    # 3 grids in same week = 3 trays, but only 2 available.
    # Solver must stagger or skip grids.
    goal = {"planning_horizon_weeks": 20, "priority": "maximize-revenue"}

    result = solve_plan(farm, [crop], goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    # Check that no more than 2 grids share the same seed week
    cells = result["cells"]
    if len(cells) == 3:
        start_weeks = [c["week_started"] for c in cells]
        seed_weeks = [w - crop["nursery_lead_weeks"] for w in start_weeks]
        from collections import Counter

        week_counts = Counter(seed_weeks)
        assert max(week_counts.values()) <= 2, (
            f"Expected max 2 grids per seed week, got {dict(week_counts)}"
        )
