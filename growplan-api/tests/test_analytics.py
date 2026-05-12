"""Tests for analytics computation service."""

import pytest
from app.services.analytics import compute_analytics, compute_crop_comparison


def _cells(*crop_ids):
    """Build a flat cell list for testing."""
    result = []
    for i, cid in enumerate(crop_ids):
        result.append({
            "cell_index": i,
            "crop_id": cid,
            "status": "planned",
            "week_started": 1,
            "week_harvest_expected": 6,
        })
    return result


def _allocations(crops_info):
    """Build allocation list. crops_info: [(crop_id, grids, sustainable_kg, rev_per_week)]"""
    return [
        {
            "crop_id": cid,
            "grids_allocated": grids,
            "sustainable_kg_per_week": skg,
            "revenue_per_week": rev,
        }
        for cid, grids, skg, rev in crops_info
    ]


def _crops(*defs):
    """Build crop param list. defs: (crop_id, weeks, yield, price, seedlings, germ_rate)"""
    return [
        {
            "id": cid,
            "weeks_on_panel": w,
            "yield_per_grid": y,
            "price_per_kg": p,
            "seedlings_per_grid": sg,
            "germination_rate": gr,
            "cost_per_seedling": 0.02,
            "nutrient_cost_per_grid_week": 0.10,
        }
        for cid, w, y, p, sg, gr in defs
    ]


def test_analytics_empty_plan():
    """Empty plan should return zeroed arrays."""
    result = compute_analytics(
        cells=[], allocations=[], crops=[], horizon_weeks=8, current_week=1,
    )
    assert len(result["revenueByWeek"]) == 8
    assert len(result["costByWeek"]) == 8
    assert len(result["profitByWeek"]) == 8
    assert result["cumulativeRevenue"] == 0


def test_analytics_single_crop():
    """Single crop should have correct weekly revenue."""
    crops = _crops(("lettuce", 5, 1.2, 4.0, 80, 0.95))
    allocs = _allocations([("lettuce", 2, 0.48, 1.92)])
    result = compute_analytics(
        cells=_cells("lettuce", "lettuce"),
        allocations=allocs,
        crops=crops,
        horizon_weeks=10,
        current_week=1,
    )
    assert result["cumulativeRevenue"] > 0
    active_weeks = [w for w in result["revenueByWeek"] if w["total"] > 0]
    assert len(active_weeks) > 0


def test_analytics_horizon_length():
    """Output arrays should have exactly horizon_weeks entries."""
    result = compute_analytics(
        cells=[], allocations=[], crops=[], horizon_weeks=12, current_week=1,
    )
    assert len(result["revenueByWeek"]) == 12
    assert len(result["costByWeek"]) == 12
    assert len(result["profitByWeek"]) == 12


def test_crop_comparison_basic():
    """Crop comparison should compute per-crop metrics and radar scores."""
    crops = _crops(
        ("lettuce", 5, 1.2, 4.0, 80, 0.95),
        ("basil", 4, 0.5, 8.0, 60, 0.90),
    )
    allocs = _allocations([
        ("lettuce", 2, 0.48, 1.92),
        ("basil", 1, 0.125, 1.0),
    ])
    result = compute_crop_comparison(allocations=allocs, crops=crops)
    assert len(result["crops"]) == 2
    for c in result["crops"]:
        assert "metrics" in c
        assert "radarScores" in c
        assert set(c["radarScores"].keys()) == {
            "revenue", "speed", "yield", "price", "ease",
        }
    assert result["recommended"] in ("lettuce", "basil")
