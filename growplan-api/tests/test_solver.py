from app.services.solver import solve_plan


def test_solver_single_crop_optimal():
    farm = {
        "rows": 2,
        "columns": 2,
        "nursery_tray_count": 10,
        "nursery_tray_cells": 100,
        "nursery_buffer_pct": 10,
    }
    crops = [
        {
            "id": "basil",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 1.5,
            "price_per_kg": 4.0,
            "seedlings_per_grid": 25,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": False,
            "edge_weight": 0.5,
            "neighbor_bonus": 1.0,
        }
    ]
    goal = {
        "planning_horizon_weeks": 8,
        "priority": "maximize-revenue",
        "commitments": {"basil": {"enabled": False, "min_kg_per_week": 0}},
    }

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    assert result["total_grids"] == 4
    assert len(result["cells"]) == 4
    assert all(cell["crop_id"] == "basil" for cell in result["cells"])


def test_solver_respects_commitments():
    farm = {
        "rows": 2,
        "columns": 4,
        "nursery_tray_count": 20,
        "nursery_tray_cells": 100,
        "nursery_buffer_pct": 10,
    }
    crops = [
        {
            "id": "basil",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 1.5,
            "price_per_kg": 4.0,
            "seedlings_per_grid": 25,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": False,
            "edge_weight": 0.5,
            "neighbor_bonus": 1.0,
        },
        {
            "id": "lettuce",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 2.0,
            "price_per_kg": 3.0,
            "seedlings_per_grid": 20,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": True,
            "edge_weight": 0.7,
            "neighbor_bonus": 0.8,
        },
    ]
    goal = {
        "planning_horizon_weeks": 8,
        "priority": "maximize-revenue",
        "commitments": {
            "lettuce": {"enabled": True, "min_kg_per_week": 2.0},
            "basil": {"enabled": False, "min_kg_per_week": 0},
        },
    }

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    lettuce_alloc = next(
        a for a in result["allocations"] if a["crop_id"] == "lettuce"
    )
    assert lettuce_alloc["sustainable_kg_per_week"] >= 2.0


def test_solver_infeasible_overcommitted():
    farm = {
        "rows": 1,
        "columns": 1,
        "nursery_tray_count": 1,
        "nursery_tray_cells": 50,
        "nursery_buffer_pct": 10,
    }
    crops = [
        {
            "id": "lettuce",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 2.0,
            "price_per_kg": 3.0,
            "seedlings_per_grid": 20,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": False,
            "edge_weight": 0.5,
            "neighbor_bonus": 1.0,
        }
    ]
    goal = {
        "planning_horizon_weeks": 8,
        "priority": "maximize-revenue",
        "commitments": {"lettuce": {"enabled": True, "min_kg_per_week": 100.0}},
    }

    result = solve_plan(farm, crops, goal)
    assert result["status"] == "INFEASIBLE"
    assert "conflicting_constraints" in result


def test_solver_stockout_mode():
    farm = {
        "rows": 2,
        "columns": 4,
        "nursery_tray_count": 20,
        "nursery_tray_cells": 100,
        "nursery_buffer_pct": 10,
    }
    crops = [
        {
            "id": "basil",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 1.5,
            "price_per_kg": 4.0,
            "seedlings_per_grid": 25,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": False,
            "edge_weight": 0.5,
            "neighbor_bonus": 1.0,
        },
        {
            "id": "lettuce",
            "weeks_on_panel": 6,
            "nursery_lead_weeks": 2,
            "yield_per_grid": 2.0,
            "price_per_kg": 3.0,
            "seedlings_per_grid": 20,
            "tray_cell_count": 200,
            "germination_rate": 0.95,
            "prefers_edge": True,
            "edge_weight": 0.7,
            "neighbor_bonus": 0.8,
        },
    ]
    goal = {
        "planning_horizon_weeks": 8,
        "priority": "minimize-stockout",
        "commitments": {
            "basil": {"enabled": False, "min_kg_per_week": 0},
            "lettuce": {"enabled": False, "min_kg_per_week": 0},
        },
    }

    result = solve_plan(farm, crops, goal)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
