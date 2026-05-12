from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    type = Column(String(30), nullable=False)
    priority = Column(String(20), nullable=False)
    week = Column(Integer, nullable=False)
    crop_id = Column(String(50), nullable=True)
    grid_indexes = Column(JSON, nullable=True)
    description = Column(String(500), nullable=False)
    revenue_impact = Column(Float, nullable=False, default=0.0)
    batch_id = Column(String(50), nullable=True)
    completed = Column(Boolean, nullable=False, default=False)

    plan = relationship("Plan", back_populates="actions")
