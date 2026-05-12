from pydantic import BaseModel, ConfigDict, Field


class CostResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    labor_cost_per_week: float = Field(alias="laborCostPerWeek")
    nutrient_cost_per_week: float = Field(alias="nutrientCostPerWeek")
    energy_cost_per_week: float = Field(alias="energyCostPerWeek")
    seed_cost_per_week: float = Field(alias="seedCostPerWeek")
    total_cost_per_week: float = Field(alias="totalCostPerWeek")
    cost_breakdown_by_crop: dict[str, float] = Field(alias="costBreakdownByCrop")
