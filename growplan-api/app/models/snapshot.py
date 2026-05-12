"""PlanSnapshot model for plan history tracking."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.sql import func

from app.database import Base


class PlanSnapshot(Base):
    __tablename__ = "plan_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(
        Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_type = Column(String(20), nullable=False)
    grid_data = Column(JSON, nullable=False)
    allocations = Column(JSON, nullable=False)
    revenue = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_snapshots_plan_id", "plan_id"),)
