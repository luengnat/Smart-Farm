from pydantic import BaseModel, ConfigDict, Field


class FarmCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    location: str | None = None
    rows: int = Field(ge=1)
    columns: int = Field(ge=1)
    growing_system: str = "hydroponic"
    nursery_tray_count: int = Field(ge=1, alias="nurseryTrayCount")
    nursery_tray_cells: int = Field(ge=1, default=200, alias="nurseryTrayCells")
    nursery_buffer_pct: float = Field(ge=0, le=100, default=10.0, alias="nurseryBufferPercent")


class FarmUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str | None = None
    location: str | None = None
    rows: int | None = Field(ge=1, default=None)
    columns: int | None = Field(ge=1, default=None)
    growing_system: str | None = None
    nursery_tray_count: int | None = Field(ge=1, default=None, alias="nurseryTrayCount")
    nursery_tray_cells: int | None = Field(ge=1, default=None, alias="nurseryTrayCells")
    nursery_buffer_pct: float | None = Field(ge=0, le=100, default=None, alias="nurseryBufferPercent")


class FarmResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: int
    name: str
    location: str | None
    rows: int
    columns: int
    growing_system: str = Field(alias="growingSystem")
    nursery_tray_count: int = Field(alias="nurseryTrayCount")
    nursery_tray_cells: int = Field(alias="nurseryTrayCells")
    nursery_buffer_pct: float = Field(alias="nurseryBufferPercent")
