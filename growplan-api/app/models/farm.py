from sqlalchemy import Column, Float, Integer, String

from app.database import Base


class Farm(Base):
    __tablename__ = "farms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    location = Column(String(100), nullable=True)
    rows = Column(Integer, nullable=False)
    columns = Column(Integer, nullable=False)
    growing_system = Column(String(50), nullable=False, default="hydroponic")
    nursery_tray_count = Column(Integer, nullable=False)
    nursery_tray_cells = Column(Integer, nullable=False, default=200)
    nursery_buffer_pct = Column(Float, nullable=False, default=10.0)
