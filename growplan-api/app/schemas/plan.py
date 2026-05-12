from pydantic import BaseModel, ConfigDict, Field


class CropCommitment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    enabled: bool
    min_kg_per_week: float = Field(alias="minKgPerWeek")


class GoalData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    planning_horizon_weeks: int = Field(ge=1, le=52, alias="planningHorizonWeeks")
    priority: str = "maximize-revenue"
    commitments: dict[str, CropCommitment]


class PlanGenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    farm_id: int = Field(alias="farmId")
    selected_crop_ids: list[str] = Field(alias="selectedCropIds")
    goal: GoalData


class PlanGenerateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    plan_id: int = Field(alias="planId")
    status: str
    poll_url: str = Field(alias="pollUrl")


class PlanStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    plan_id: int = Field(alias="planId")
    status: str
    solver_status: str | None = Field(None, alias="solverStatus")
    solver_time_ms: int | None = Field(None, alias="solverTimeMs")
    error_message: str | None = Field(None, alias="errorMessage")


class GridCellResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    index: int
    crop_id: str | None = Field(alias="cropId")
    status: str
    week_started: int | None = Field(alias="weekStarted")
    week_harvest_expected: int | None = Field(alias="weekHarvestExpected")


class AllocationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    crop_id: str = Field(alias="cropId")
    grids_allocated: int = Field(alias="gridsAllocated")
    sustainable_kg_per_week: float = Field(alias="sustainableKgPerWeek")
    revenue_per_week: float = Field(alias="revenuePerWeek")


class RevenueResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    total_per_week: float = Field(alias="totalRevenuePerWeek")
    max_possible: float = Field(alias="maxPossibleRevenuePerWeek")
    revenue_gap: float = Field(alias="revenueGap")
    revenue_by_crop: dict[str, float] = Field(alias="revenueByCrop")
    opportunity_cost: float = Field(alias="opportunityCostOfCommitments")


class PlanResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: int
    status: str
    rows: int | None = None
    columns: int | None = None
    total_grids: int | None = Field(None, alias="totalGrids")
    cells: list[GridCellResponse] = []
    allocations: list[AllocationResponse] = []
    revenue: RevenueResponse | None = None
    horizon_weeks: int = Field(alias="horizonWeeks")
    current_week: int = Field(1, alias="currentWeek")
    goal_priority: str = Field(alias="goalPriority")
    selected_crops: list[str] = Field(alias="selectedCrops")
