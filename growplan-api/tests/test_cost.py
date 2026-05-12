"""Tests for weekly cost calculation service."""

from app.services.cost import calculate_weekly_costs


def test_calculate_labor_cost():
    actions = [
        {"type": "transplant", "minutes_per_grid": 8, "grids": 3},
        {"type": "harvest", "minutes_per_grid": 10, "grids": 2},
    ]
    allocations = [
        {"crop_id": "lettuce", "grids_allocated": 24},
        {"crop_id": "basil", "grids_allocated": 24},
    ]
    farm_config = {
        "nursery_tray_count": 30,
        "hourly_rate": 15.0,
        "base_energy_weekly": 20.0,
        "energy_per_grid": 0.50,
        "energy_per_tray": 0.10,
    }
    crops = [
        {
            "id": "lettuce",
            "seedlings_per_grid": 20,
            "nutrient_cost_per_grid_week": 0.10,
            "cost_per_seedling": 0.02,
            "weeks_on_panel": 5,
        },
        {
            "id": "basil",
            "seedlings_per_grid": 25,
            "nutrient_cost_per_grid_week": 0.08,
            "cost_per_seedling": 0.03,
            "weeks_on_panel": 6,
        },
    ]
    result = calculate_weekly_costs(
        actions=actions,
        allocations=allocations,
        farm_config=farm_config,
        crops=crops,
    )
    assert result["labor"] > 0
    assert result["total"] > 0


def test_cost_with_multiple_crops():
    actions = [
        {"type": "transplant", "minutes_per_grid": 8, "grids": 3},
        {"type": "harvest", "minutes_per_grid": 10, "grids": 2},
        {"type": "seed-nursery", "minutes_per_grid": 5, "grids": 1},
    ]
    allocations = [
        {"crop_id": "lettuce", "grids_allocated": 24},
        {"crop_id": "basil", "grids_allocated": 24},
    ]
    farm_config = {
        "nursery_tray_count": 30,
        "hourly_rate": 15.0,
        "base_energy_weekly": 20.0,
        "energy_per_grid": 0.50,
        "energy_per_tray": 0.10,
    }
    crops = [
        {
            "id": "lettuce",
            "seedlings_per_grid": 20,
            "nutrient_cost_per_grid_week": 0.10,
            "cost_per_seedling": 0.02,
            "weeks_on_panel": 5,
        },
        {
            "id": "basil",
            "seedlings_per_grid": 25,
            "nutrient_cost_per_grid_week": 0.08,
            "cost_per_seedling": 0.03,
            "weeks_on_panel": 6,
        },
    ]
    result = calculate_weekly_costs(
        actions=actions,
        allocations=allocations,
        farm_config=farm_config,
        crops=crops,
    )
    assert result["labor"] > 0
    assert result["nutrients"] > 0
    assert result["energy"] > 0
    assert result["seeds"] > 0
    assert (
        abs(
            result["total"]
            - (
                result["labor"]
                + result["nutrients"]
                + result["energy"]
                + result["seeds"]
            )
        )
        < 0.01
    )
