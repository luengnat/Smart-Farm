import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, UniqueConstraint

from app.database import Base


class MemberRole(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    viewer = "viewer"


class FarmMember(Base):
    __tablename__ = "farm_members"
    __table_args__ = (
        UniqueConstraint("user_id", "farm_id", name="uq_user_farm"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    farm_id = Column(Integer, ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MemberRole), nullable=False, default=MemberRole.owner)
