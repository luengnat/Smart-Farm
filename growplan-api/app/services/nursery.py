"""Nursery scheduling service.

Generates seedling batch plans and weekly tray occupancy from solver
allocations. All functions are pure -- no DB access.
"""

from __future__ import annotations

import math
from typing import Any


def build_batches(
    allocations: list[dict[str, Any]],
    crops: list[dict[str, Any]],
    horizon_weeks: int,
    buffer_pct: float = 0,
) -> list[dict[str, Any]]:
    """Create nursery seedling batches from crop allocations.

    Parameters
    ----------
    allocations:
        Per-crop allocation dicts with ``crop_id`` and ``grids_allocated``.
    crops:
        Crop parameter dicts (must contain ``id``, ``seedlings_per_grid``,
        ``tray_cell_count``, ``germination_rate``, ``nursery_lead_weeks``).
    horizon_weeks:
        Total planning horizon in weeks.
    buffer_pct:
        Percentage buffer to add to tray counts.

    Returns
    -------
    list[dict]
        Each batch has ``id``, ``crop_id``, ``seed_week``,
        ``transplant_week``, ``seedling_count``, ``tray_count``, ``status``.
    """
    crop_map: dict[str, dict[str, Any]] = {c["id"]: c for c in crops}

    batches: list[dict[str, Any]] = []
    for alloc in allocations:
        cid = alloc["crop_id"]
        grids = alloc.get("grids_allocated", 0)
        if grids <= 0:
            continue

        crop = crop_map[cid]
        seedlings_per_grid = crop["seedlings_per_grid"]
        tray_cell_count = crop["tray_cell_count"]
        germination_rate = crop["germination_rate"]
        nursery_lead_weeks = crop["nursery_lead_weeks"]

        # Account for germination losses -- round up to whole seedlings.
        seedling_count = math.ceil(grids * seedlings_per_grid / germination_rate)

        # Trays needed for these seedlings.
        tray_count = math.ceil(seedling_count / tray_cell_count)

        # Apply buffer.
        tray_count = math.ceil(tray_count * (1 + buffer_pct / 100))

        seed_week = 1
        transplant_week = seed_week + nursery_lead_weeks

        batches.append(
            {
                "id": f"{cid}-w{seed_week}",
                "crop_id": cid,
                "seed_week": seed_week,
                "transplant_week": transplant_week,
                "seedling_count": seedling_count,
                "tray_count": tray_count,
                "status": "planned",
            }
        )

    return batches


def build_occupancy(
    batches: list[dict[str, Any]],
    total_trays: int,
    horizon_weeks: int,
) -> list[dict[str, Any]]:
    """Build weekly nursery tray occupancy from batch schedule.

    A batch occupies trays from its ``seed_week`` (inclusive) up to
    ``transplant_week`` (exclusive).

    Parameters
    ----------
    batches:
        Output of :func:`build_batches`.
    total_trays:
        Total nursery trays available.
    horizon_weeks:
        Planning horizon in weeks.

    Returns
    -------
    list[dict]
        Per-week occupancy with ``week``, ``trays_in_use``,
        ``trays_available``, ``total_trays``, ``batches``.
    """
    occupancy: list[dict[str, Any]] = []

    for week in range(1, horizon_weeks + 1):
        active_batches: list[dict[str, Any]] = []
        trays_in_use = 0

        for batch in batches:
            sw = batch["seed_week"]
            tw = batch["transplant_week"]
            if sw <= week < tw:
                trays_in_use += batch["tray_count"]
                active_batches.append(
                    {
                        "id": batch["id"],
                        "crop_id": batch["crop_id"],
                        "tray_count": batch["tray_count"],
                    }
                )

        occupancy.append(
            {
                "week": week,
                "trays_in_use": trays_in_use,
                "trays_available": total_trays - trays_in_use,
                "total_trays": total_trays,
                "batches": active_batches,
            }
        )

    return occupancy
