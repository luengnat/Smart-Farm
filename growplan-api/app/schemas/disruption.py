from pydantic import BaseModel, ConfigDict, Field


class DisruptionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: str
    grid_indexes: list[int] = Field(alias="gridIndexes")
    crop_id: str = Field(alias="cropId")
    week: int
    description: str | None = None


class ReplantOptionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    crop_id: str = Field(alias="cropId")
    description: str
    revenue_recovered: float = Field(alias="revenueRecovered")
    weeks_until_harvest: int = Field(alias="weeksUntilHarvest")
    seedlings_available: bool = Field(alias="seedlingsAvailable")
    recommended: bool


class ReplanResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    replanned_plan: dict = Field(alias="replannedPlan")
    replant_options: list[ReplantOptionResponse] = Field(alias="replantOptions")
    grids_changed: int = Field(alias="gridsChanged")
    revenue_delta_per_week: float = Field(alias="revenueDeltaPerWeek")
    nursery_impact: str = Field(alias="nurseryImpact")
