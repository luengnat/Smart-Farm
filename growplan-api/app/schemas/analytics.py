# app/schemas/analytics.py
"""Pydantic schemas for analytics, timeline, history, and comparison endpoints."""

from pydantic import BaseModel, ConfigDict, Field


# --- Analytics ---

class WeeklyCostEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    week: int
    labor: float = 0
    nutrients: float = 0
    energy: float = 0
    seeds: float = 0
    total: float = 0


class WeeklyProfitEntry(BaseModel):
    week: int
    revenue: float = 0
    cost: float = 0
    profit: float = 0
    margin: float = 0


class AnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue_by_week: list[dict] = Field(alias="revenueByWeek")
    cost_by_week: list[dict] = Field(alias="costByWeek")
    profit_by_week: list[dict] = Field(alias="profitByWeek")
    cumulative_revenue: float = Field(alias="cumulativeRevenue")
    cumulative_cost: float = Field(alias="cumulativeCost")
    cumulative_profit: float = Field(alias="cumulativeProfit")


# --- Timeline ---

class TimelineInterval(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    cell_index: int = Field(alias="cellIndex")
    start_week: int = Field(alias="startWeek")
    end_week: int = Field(alias="endWeek")
    phase: str


class TimelineCrop(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crop_id: str = Field(alias="cropId")
    crop_name: str = Field(alias="cropName")
    color: str
    intervals: list[TimelineInterval]


class TimelineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crops: list[TimelineCrop]
    current_week: int = Field(alias="currentWeek")
    horizon_weeks: int = Field(alias="horizonWeeks")


# --- History ---

class SnapshotSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: int
    snapshot_type: str = Field(alias="snapshotType")
    total_grids: int = Field(alias="totalGrids")
    crop_count: int = Field(alias="cropCount")
    revenue_per_week: float = Field(alias="revenuePerWeek")
    created_at: str = Field(alias="createdAt")


class HistoryResponse(BaseModel):
    snapshots: list[SnapshotSummary]
    total: int
    page: int
    limit: int


# --- Crop Comparison ---

class CropMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue_per_grid_week: float = Field(alias="revenuePerGridWeek")
    cost_per_grid_week: float = Field(alias="costPerGridWeek")
    net_margin_per_grid_week: float = Field(alias="netMarginPerGridWeek")
    margin_pct: float = Field(alias="marginPct")
    cycle_weeks: int = Field(alias="cycleWeeks")
    nursery_trays_per_cycle: int = Field(alias="nurseryTraysPerCycle")
    seed_cost_per_cycle: float = Field(alias="seedCostPerCycle")


class RadarScores(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    revenue: int
    speed: int
    yield_: int = Field(alias="yield")
    price: int
    ease: int


class ComparisonCrop(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crop_id: str = Field(alias="cropId")
    crop_name: str = Field(alias="cropName")
    color: str
    metrics: CropMetrics
    radar_scores: RadarScores = Field(alias="radarScores")


class CompareResponse(BaseModel):
    crops: list[ComparisonCrop]
    recommended: str


# --- Farm Plans ---

class PlanSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: int
    status: str
    horizon_weeks: int = Field(alias="horizonWeeks")
    current_week: int = Field(1, alias="currentWeek")
    goal_priority: str = Field(alias="goalPriority")
    selected_crops: list[str] = Field(alias="selectedCrops")
    revenue_total: float | None = Field(None, alias="revenueTotal")
    created_at: str = Field(alias="createdAt")