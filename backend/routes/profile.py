from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=schemas.ProfileResponse)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.patch("", response_model=schemas.ProfileResponse)
def update_profile(
    payload: schemas.ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    update_data = payload.model_dump(exclude_unset=True)

    # Serialize nested pydantic objects to plain dicts before storing as JSON
    for field in ("work_experience", "education"):
        if field in update_data and update_data[field] is not None:
            update_data[field] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in update_data[field]
            ]

    # skills sent as list of strings, store directly
    for key, value in update_data.items():
        setattr(current_user, key, value)

    db.commit()
    db.refresh(current_user)
    return current_user
