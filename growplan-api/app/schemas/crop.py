from pydantic import BaseModel, ConfigDict, Field


class CropResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: str
    name: str
    category: str
    icon: str
    accent: str
    weeks_on_panel: int = Field(alias="weeksOnPanel")
    nursery_lead_weeks: int = Field(alias="nurseryLeadWeeks")
    yield_per_grid: float = Field(alias="yieldPerGrid")
    price_per_kg: float = Field(alias="pricePerKg")
    seedlings_per_grid: int = Field(alias="seedlingsPerGrid")
    tray_cell_count: int = Field(alias="trayCellCount")
    germination_rate: float = Field(alias="germinationRate")
    prefers_edge: bool = Field(alias="prefersEdge")
    edge_weight: float = Field(alias="edgeWeight")
    neighbor_bonus: float = Field(alias="neighborBonus")
    nutrient_cost_per_grid_week: float = Field(alias="nutrientCostPerGridWeek")
    cost_per_seedling: float = Field(alias="costPerSeedling")
