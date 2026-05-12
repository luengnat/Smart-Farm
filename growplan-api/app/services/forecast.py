from typing import Any


def moving_average(
    history: list[dict[str, Any]], crop_id: str, weeks: int = 4
) -> float:
    """Simple moving average over the last N weeks of sales data for a crop."""
    crop_data = [h["kg_sold"] for h in history if h["crop_id"] == crop_id]
    recent = crop_data[-weeks:] if len(crop_data) >= weeks else crop_data
    if not recent:
        return 0.0
    return sum(recent) / len(recent)


def exponential_smoothing(
    history: list[dict[str, Any]], crop_id: str, alpha: float = 0.3
) -> float:
    """Exponential smoothing forecast for a crop.

    alpha: smoothing factor (0-1). Higher = more weight on recent data.
    """
    crop_data = sorted(
        [h for h in history if h["crop_id"] == crop_id],
        key=lambda h: h["week"],
    )
    if not crop_data:
        return 0.0

    result = crop_data[0]["kg_sold"]
    for point in crop_data[1:]:
        result = alpha * point["kg_sold"] + (1 - alpha) * result
    return result


def forecast_demand(history: list[dict[str, Any]], crop_id: str) -> float:
    """Pick forecast model based on data length.

    Phase 1: moving average for short history, exponential smoothing for longer.
    """
    crop_data = [h for h in history if h["crop_id"] == crop_id]
    if not crop_data:
        return 0.0

    if len(crop_data) < 8:
        return moving_average(history, crop_id)
    return exponential_smoothing(history, crop_id)
