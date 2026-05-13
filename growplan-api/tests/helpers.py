"""
Shared test helpers for AI regression testing.

Provides mock data factories, response shape validators, and reusable
fixture helpers. These catch the #1 AI regression pattern: field added
to one code path but forgotten in another (e.g., solver vs API response).
"""

from __future__ import annotations

from typing import Any


# ─── Response shape validation ───

REQUIRED_ALLOCATION_FIELDS = (
    "cropId",
    "gridsAllocated",
    "sustainableKgPerWeek",
    "revenuePerWeek",
)

REQUIRED_PLAN_FIELDS = (
    "id",
    "status",
    "rows",
    "columns",
    "levels",
    "totalGrids",
    "cells",
    "allocations",
    "revenue",
    "horizonWeeks",
    "currentWeek",
    "goalPriority",
    "selectedCrops",
)

REQUIRED_REVENUE_FIELDS = (
    "totalRevenuePerWeek",
    "maxPossibleRevenuePerWeek",
    "revenueGap",
    "revenueByCrop",
    "opportunityCostOfCommitments",
)


def assert_has_fields(
    data: dict[str, Any],
    required: tuple[str, ...],
    label: str = "response",
) -> None:
    """Assert every field in `required` exists and is not None/undefined."""
    missing = [f for f in required if f not in data or data[f] is None]
    if missing:
        present = list(data.keys())
        raise AssertionError(
            f"{label} missing fields: {missing}. "
            f"Present keys: {present}"
        )


def assert_same_shape(
    a: dict[str, Any],
    b: dict[str, Any],
    label_a: str = "path A",
    label_b: str = "path B",
) -> None:
    """Assert two dicts have the same top-level keys."""
    keys_a = set(a.keys())
    keys_b = set(b.keys())
    only_a = keys_a - keys_b
    only_b = keys_b - keys_a
    if only_a or only_b:
        parts: list[str] = []
        if only_a:
            parts.append(f"only in {label_a}: {sorted(only_a)}")
        if only_b:
            parts.append(f"only in {label_b}: {sorted(only_b)}")
        raise AssertionError(f"Shape mismatch: {'; '.join(parts)}")


# ─── Factory helpers ───

def make_farm_payload(**overrides: Any) -> dict[str, Any]:
    """Create a valid farm creation payload with sensible defaults."""
    payload = {
        "name": "Test Farm",
        "rows": 4,
        "columns": 12,
        "growingSystem": "hydroponic",
        "nurseryTrayCount": 30,
        "nurseryTrayCells": 200,
        "nurseryBufferPercent": 10,
    }
    payload.update(overrides)
    return payload


def make_generate_plan_payload(
    farm_id: int,
    crop_ids: list[str] | None = None,
    **goal_overrides: Any,
) -> dict[str, Any]:
    """Create a valid plan generation payload with sensible defaults."""
    if crop_ids is None:
        crop_ids = ["lettuce", "basil"]
    commitments = {
        cid: {"enabled": False, "minKgPerWeek": 0}
        for cid in crop_ids
    }
    goal = {
        "planningHorizonWeeks": 8,
        "priority": "maximize-revenue",
        "commitments": commitments,
    }
    goal.update(goal_overrides)
    return {
        "farmId": farm_id,
        "selectedCropIds": crop_ids,
        "goal": goal,
    }


# ─── Reusable fixtures (import and use in conftest or test files) ───

DEFAULT_CROPS = [
    {
        "id": "lettuce",
        "name": "Lettuce",
        "category": "Leafy Green",
        "icon": "L",
        "accent": "#9edb66",
        "weeks_on_panel": 5,
        "nursery_lead_weeks": 2,
        "yield_per_grid": 1.2,
        "price_per_kg": 4.0,
        "seedlings_per_grid": 80,
        "tray_cell_count": 200,
        "germination_rate": 0.95,
        "prefers_edge": True,
        "edge_weight": 1.1,
        "neighbor_bonus": 2.0,
        "nutrient_cost_per_grid_week": 0.10,
        "cost_per_seedling": 0.02,
    },
    {
        "id": "basil",
        "name": "Basil",
        "category": "Herb",
        "icon": "B",
        "accent": "#86c56a",
        "weeks_on_panel": 6,
        "nursery_lead_weeks": 2,
        "yield_per_grid": 0.6,
        "price_per_kg": 12.0,
        "seedlings_per_grid": 100,
        "tray_cell_count": 200,
        "germination_rate": 0.90,
        "prefers_edge": False,
        "edge_weight": 0.9,
        "neighbor_bonus": 2.8,
        "nutrient_cost_per_grid_week": 0.12,
        "cost_per_seedling": 0.03,
    },
]
