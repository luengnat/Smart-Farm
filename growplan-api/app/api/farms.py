from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.farm import Farm
from app.models.farm_member import FarmMember, MemberRole
from app.models.plan import Plan
from app.models.user import User
from app.schemas.farm import FarmCreate, FarmResponse, FarmUpdate

router = APIRouter(prefix="/farms", tags=["farms"])


def _verify_farm_access(farm_id: int, user: User, db: Session) -> Farm:
    farm = db.query(Farm).filter(Farm.id == farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    membership = (
        db.query(FarmMember)
        .filter(FarmMember.user_id == user.id, FarmMember.farm_id == farm_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this farm")
    return farm


@router.post("", response_model=FarmResponse, status_code=201)
def create_farm(
    data: FarmCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm = Farm(**data.model_dump(by_alias=False))
    db.add(farm)
    db.flush()
    membership = FarmMember(
        user_id=current_user.id,
        farm_id=farm.id,
        role=MemberRole.owner,
    )
    db.add(membership)
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/{farm_id}", response_model=FarmResponse)
def get_farm(
    farm_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _verify_farm_access(farm_id, current_user, db)


@router.put("/{farm_id}", response_model=FarmResponse)
def update_farm(
    farm_id: int,
    data: FarmUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm = _verify_farm_access(farm_id, current_user, db)
    updates = data.model_dump(by_alias=False, exclude_unset=True, exclude_none=True)
    for key, value in updates.items():
        setattr(farm, key, value)
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/{farm_id}/plans")
def get_farm_plans(
    farm_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_farm_access(farm_id, current_user, db)
    plans = db.query(Plan).filter(Plan.farm_id == farm_id).order_by(Plan.created_at.desc()).all()
    return {
        "plans": [
            {
                "id": p.id,
                "status": p.status,
                "horizonWeeks": p.horizon_weeks,
                "currentWeek": p.current_week,
                "goalPriority": p.goal_priority,
                "selectedCrops": p.selected_crops or [],
                "revenueTotal": p.revenue_total,
                "createdAt": p.created_at.isoformat() if p.created_at else "",
            }
            for p in plans
        ]
    }
