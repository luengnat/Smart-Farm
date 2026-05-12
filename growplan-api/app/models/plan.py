from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    horizon_weeks = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="solving")
    goal_priority = Column(String(30), nullable=False, default="maximize-revenue")
    selected_crops = Column(JSON, nullable=False, default=list)
    goal_commitments = Column(JSON, nullable=True)
    current_week = Column(Integer, nullable=False, default=1)
    total_grids = Column(Integer, nullable=True)
    revenue_total = Column(Float, nullable=True)
    revenue_max = Column(Float, nullable=True)
    revenue_efficiency = Column(Float, nullable=True)
    revenue_opportunity_cost = Column(Float, nullable=True)
    revenue_gap = Column(Float, nullable=True)
    solver_status = Column(String(30), nullable=True)
    solver_time_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    cells = relationship("GridCell", back_populates="plan", cascade="all, delete-orphan")
    allocations = relationship("Allocation", back_populates="plan", cascade="all, delete-orphan")
    nursery_batches = relationship("NurseryBatch", back_populates="plan", cascade="all, delete-orphan")
    disruptions = relationship("Disruption", back_populates="plan", cascade="all, delete-orphan")
    actions = relationship("Action", back_populates="plan", cascade="all, delete-orphan")


class GridCell(Base):
    __tablename__ = "grid_cells"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    cell_index = Column(Integer, nullable=False)
    crop_id = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="planned")
    week_started = Column(Integer, nullable=True)
    week_harvest_expected = Column(Integer, nullable=True)

    plan = relationship("Plan", back_populates="cells")


class Allocation(Base):
    __tablename__ = "allocations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    crop_id = Column(String(50), nullable=False)
    grids_allocated = Column(Integer, nullable=False, default=0)
    sustainable_kg_per_week = Column(Float, nullable=False, default=0.0)
    revenue_per_week = Column(Float, nullable=False, default=0.0)

    plan = relationship("Plan", back_populates="allocations")
