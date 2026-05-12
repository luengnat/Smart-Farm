from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class NurseryBatch(Base):
    __tablename__ = "nursery_batches"

    id = Column(String(50), primary_key=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), primary_key=True)
    crop_id = Column(String(50), nullable=False)
    seed_week = Column(Integer, nullable=False)
    transplant_week = Column(Integer, nullable=False)
    seedling_count = Column(Integer, nullable=False)
    tray_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="planned")

    plan = relationship("Plan", back_populates="nursery_batches")
