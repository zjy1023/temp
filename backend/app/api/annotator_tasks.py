from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AnnotatorUser
from app.db.session import get_db
from app.schemas.task import AnnotatorTasksOut, ClaimOut
from app.services.tasks import claim_task, list_annotator_tasks

router = APIRouter(prefix="/annotator/tasks", tags=["annotator"])


@router.get("", response_model=AnnotatorTasksOut)
def tasks(
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> AnnotatorTasksOut:
    return list_annotator_tasks(db, user)


@router.post("/{task_id}/claim", response_model=ClaimOut)
def claim(
    task_id: uuid.UUID,
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> ClaimOut:
    return claim_task(db, user, task_id)
