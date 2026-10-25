from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import AnnotatorUser
from app.db.session import get_db
from app.schemas.task import (
    AssignmentDetail,
    DraftOut,
    DraftUpdate,
    SubmitOut,
    SubmitRequest,
)
from app.services.assignments import save_draft, submit_assignment
from app.services.tasks import get_annotator_assignment, release_assignment

router = APIRouter(prefix="/annotator/assignments", tags=["annotator"])


@router.get("/{assignment_id}", response_model=AssignmentDetail)
def detail(
    assignment_id: uuid.UUID,
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> AssignmentDetail:
    return get_annotator_assignment(db, user, assignment_id)


@router.put("/{assignment_id}/draft", response_model=DraftOut)
def draft(
    assignment_id: uuid.UUID,
    payload: DraftUpdate,
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> DraftOut:
    return save_draft(db, user, assignment_id, payload)


@router.post("/{assignment_id}/submit", response_model=SubmitOut)
def submit(
    assignment_id: uuid.UUID,
    payload: SubmitRequest,
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> SubmitOut:
    return submit_assignment(db, user, assignment_id, payload)


@router.post("/{assignment_id}/release", status_code=204)
def release(
    assignment_id: uuid.UUID,
    user: AnnotatorUser,
    db: Session = Depends(get_db),
) -> Response:
    release_assignment(db, user, assignment_id)
    return Response(status_code=204)
