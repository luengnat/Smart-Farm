from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.farm import Farm
from app.schemas.farm import FarmCreate, FarmUpdate, FarmResponse

router = APIRouter(prefix="/farms", tags=["farms"])


@router.post("", response_model=FarmResponse, status_code=201)
def create_farm(data: FarmCreate, db: Session = Depends(get_db)):
    farm = Farm(**data.model_dump(by_alias=False))
    db.add(farm)
    db.commit()
    db.refresh(farm)
    return farm


@router.get("/{farm_id}", response_model=FarmResponse)
def get_farm(farm_id: int, db: Session = Depends(get_db)):
    farm = db.query(Farm).filter(Farm.id == farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm


@router.put("/{farm_id}", response_model=FarmResponse)
def update_farm(farm_id: int, data: FarmUpdate, db: Session = Depends(get_db)):
    farm = db.query(Farm).filter(Farm.id == farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    updates = data.model_dump(by_alias=False, exclude_unset=True, exclude_none=True)
    for key, value in updates.items():
        setattr(farm, key, value)
    db.commit()
    db.refresh(farm)
    return farm
