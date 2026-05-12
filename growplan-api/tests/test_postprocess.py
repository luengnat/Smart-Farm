from app.services.postprocess import extract_cells, extract_allocations, calculate_revenue


def test_extract_cells_assigns_all_grids():
    solver_cells = [
        {
            "cell_index": 0,
            "crop_id": "basil",
            "status": "planned",
            "week_started": 0,
            "week_harvest_expected": 6,
        },
        {
            "cell_index": 1,
            "crop_id": "basil",
            "status": "planned",
            "week_started": 0,
            "week_harvest_expected": 6,
        },
        {
            "cell_index": 2,
            "crop_id": "lettuce",
            "status": "planned",
            "week_started": 0,
            "week_harvest_expected": 6,
        },
        {
            "cell_index": 3,
            "crop_id": "lettuce",
            "status": "planned",
            "week_started": 0,
            "week_harvest_expected": 6,
        },
    ]
    cells = extract_cells(solver_cells, rows=2, cols=2)
    assert len(cells) == 4
    assert all(c["crop_id"] is not None for c in cells)


def test_calculate_revenue():
    crops = [
        {"id": "basil", "yield_per_grid": 1.5, "price_per_kg": 4.0, "weeks_on_panel": 6},
        {"id": "lettuce", "yield_per_grid": 2.0, "price_per_kg": 3.0, "weeks_on_panel": 6},
    ]
    allocations = [
        {
            "crop_id": "basil",
            "grids_allocated": 2,
            "sustainable_kg_per_week": 1.0,
            "revenue_per_week": 4.0,
        },
        {
            "crop_id": "lettuce",
            "grids_allocated": 2,
            "sustainable_kg_per_week": 1.33,
            "revenue_per_week": 4.0,
        },
    ]
    revenue = calculate_revenue(allocations, total_grids=4, crops=crops, commitments={})
    assert revenue["total_per_week"] == 8.0
    assert revenue["max_possible"] >= 8.0
    assert revenue["efficiency_pct"] <= 100
