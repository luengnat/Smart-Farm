from sqlalchemy import Boolean, Column, Float, Integer, String

from app.database import Base


class Crop(Base):
    __tablename__ = "crops"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    icon = Column(String(10), nullable=False)
    accent = Column(String(7), nullable=False)
    weeks_on_panel = Column(Integer, nullable=False)
    nursery_lead_weeks = Column(Integer, nullable=False)
    yield_per_grid = Column(Float, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    seedlings_per_grid = Column(Integer, nullable=False)
    tray_cell_count = Column(Integer, nullable=False, default=200)
    germination_rate = Column(Float, nullable=False, default=0.95)
    prefers_edge = Column(Boolean, nullable=False, default=False)
    edge_weight = Column(Float, nullable=False, default=0.5)
    neighbor_bonus = Column(Float, nullable=False, default=1.0)
    nutrient_cost_per_grid_week = Column(Float, nullable=False, default=0.10)
    cost_per_seedling = Column(Float, nullable=False, default=0.02)
