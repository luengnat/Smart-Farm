from pydantic import BaseModel, ConfigDict, Field


class NurseryBatchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: str
    crop_id: str = Field(alias="cropId")
    seed_week: int = Field(alias="seedWeek")
    transplant_week: int = Field(alias="transplantWeek")
    seedling_count: int = Field(alias="seedlingCount")
    tray_count: int = Field(alias="trayCount")
    status: str


class NurseryOccupancyBatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    batch_id: str = Field(alias="batchId")
    crop_id: str = Field(alias="cropId")
    tray_count: int = Field(alias="trayCount")
    week_started: int = Field(alias="weekStarted")
    week_freed: int = Field(alias="weekFreed")


class NurseryOccupancyResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    week: int
    trays_in_use: int = Field(alias="traysInUse")
    trays_available: int = Field(alias="traysAvailable")
    total_trays: int = Field(alias="totalTrays")
    batches: list[NurseryOccupancyBatch] = []
