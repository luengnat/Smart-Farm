from app.services.forecast import moving_average, exponential_smoothing, forecast_demand

def test_moving_average():
    history = [
        {"week": 1, "crop_id": "lettuce", "kg_sold": 10},
        {"week": 2, "crop_id": "lettuce", "kg_sold": 12},
        {"week": 3, "crop_id": "lettuce", "kg_sold": 11},
        {"week": 4, "crop_id": "lettuce", "kg_sold": 13},
    ]
    result = moving_average(history, crop_id="lettuce", weeks=4)
    assert abs(result - 11.5) < 0.1

def test_moving_average_with_multiple_crops():
    history = [
        {"week": 1, "crop_id": "lettuce", "kg_sold": 10},
        {"week": 1, "crop_id": "basil", "kg_sold": 5},
        {"week": 2, "crop_id": "lettuce", "kg_sold": 12},
        {"week": 2, "crop_id": "basil", "kg_sold": 6},
        {"week": 3, "crop_id": "lettuce", "kg_sold": 11},
        {"week": 3, "crop_id": "basil", "kg_sold": 5},
        {"week": 4, "crop_id": "lettuce", "kg_sold": 13},
        {"week": 4, "crop_id": "basil", "kg_sold": 7},
    ]
    result = moving_average(history, crop_id="lettuce", weeks=4)
    assert abs(result - 11.5) < 0.1
    result_basil = moving_average(history, crop_id="basil", weeks=4)
    assert abs(result_basil - 5.75) < 0.1

def test_exponential_smoothing():
    history = [
        {"week": i, "crop_id": "lettuce", "kg_sold": 10 + i} for i in range(1, 9)
    ]
    result = exponential_smoothing(history, crop_id="lettuce", alpha=0.3)
    assert result > 0
    assert isinstance(result, float)

def test_forecast_demand_picks_ma_for_short_history():
    history = [
        {"week": 1, "crop_id": "lettuce", "kg_sold": 10},
        {"week": 2, "crop_id": "lettuce", "kg_sold": 12},
        {"week": 3, "crop_id": "lettuce", "kg_sold": 11},
        {"week": 4, "crop_id": "lettuce", "kg_sold": 13},
    ]
    result = forecast_demand(history, crop_id="lettuce")
    assert result > 0

def test_forecast_demand_empty_history():
    result = forecast_demand([], crop_id="lettuce")
    assert result == 0.0
