from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.db.session import get_db
from app.schemas.task import AnnotatorOut
from app.services.tasks import list_annotators

router = APIRouter(prefix="/admin/annotators", tags=["admin"])


@router.get("", response_model=list[AnnotatorOut])
def annotators(
    user: AdminUser,
    tenant_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[AnnotatorOut]:
    return list_annotators(db, user, tenant_id)
