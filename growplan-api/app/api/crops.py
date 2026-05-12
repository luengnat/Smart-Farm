from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.crop import Crop
from app.models.user import User
from app.schemas.crop import CropResponse

router = APIRouter(prefix="/crops", tags=["crops"])


@router.get("", response_model=list[CropResponse])
def list_crops(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Crop).all()
