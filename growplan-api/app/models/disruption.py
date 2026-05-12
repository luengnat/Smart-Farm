from sqlalchemy import JSON, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Disruption(Base):
    __tablename__ = "disruptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    type = Column(String(30), nullable=False)
    grid_indexes = Column(JSON, nullable=False, default=list)
    crop_id = Column(String(50), nullable=False)
    week = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)

    plan = relationship("Plan", back_populates="disruptions")
