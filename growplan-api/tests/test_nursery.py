from app.services.nursery import build_batches, build_occupancy


def test_build_occupancy_respects_tray_limit():
    crops = [
        {
            "id": "basil",
            "seedlings_per_grid": 25,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "nursery_lead_weeks": 2,
            "weeks_on_panel": 6,
        }
    ]
    allocations = [{"crop_id": "basil", "grids_allocated": 4}]
    batches = build_batches(
        allocations=allocations, crops=crops, horizon_weeks=8, buffer_pct=10
    )
    occupancy = build_occupancy(batches, total_trays=30, horizon_weeks=8)
    assert all(w["trays_in_use"] <= 30 for w in occupancy)
    assert all(w["trays_available"] >= 0 for w in occupancy)
