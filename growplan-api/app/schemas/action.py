from pydantic import BaseModel, ConfigDict, Field


class ActionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: int
    type: str
    priority: str
    week: int
    crop_id: str | None = Field(None, alias="cropId")
    grid_indexes: list[int] | None = Field(None, alias="gridIndexes")
    description: str
    revenue_impact: float = Field(0.0, alias="revenueImpact")
    batch_id: str | None = Field(None, alias="batchId")
    completed: bool = False
