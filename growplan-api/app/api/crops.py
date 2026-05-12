from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.crop import Crop
from app.schemas.crop import CropResponse

router = APIRouter(prefix="/crops", tags=["crops"])


@router.get("", response_model=list[CropResponse])
def list_crops(db: Session = Depends(get_db)):
    return db.query(Crop).all()
