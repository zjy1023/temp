from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain.errors import DomainError
from app.domain.intervals import Interval, validate_segments
from app.models import Assignment, AssignmentStatus, Segment, Task, TaskStatus, User
from app.schemas.task import (
    DraftOut,
    DraftUpdate,
    SubmitOut,
    SubmitRequest,
    segment_out,
)


def _locked_assignment(
    db: Session, user: User, assignment_id: uuid.UUID
) -> Assignment:
    assignment = db.scalar(
        select(Assignment)
        .options(
            selectinload(Assignment.task).selectinload(Task.video),
            selectinload(Assignment.segments),
        )
        .where(
            Assignment.id == assignment_id,
            Assignment.annotator_id == user.id,
            Assignment.tenant_id == user.tenant_id,
        )
        .with_for_update()
    )
    if assignment is None or assignment.status == AssignmentStatus.RELEASED:
        raise DomainError(404, "NOT_FOUND", "标注任务不存在")
    return assignment


def save_draft(
    db: Session, user: User, assignment_id: uuid.UUID, payload: DraftUpdate
) -> DraftOut:
    assignment = _locked_assignment(db, user, assignment_id)
    if assignment.status != AssignmentStatus.CLAIMED:
        raise DomainError(409, "ASSIGNMENT_NOT_EDITABLE", "任务已提交，不能修改")
    if assignment.version != payload.version:
        raise DomainError(409, "VERSION_CONFLICT", "草稿已在其他窗口修改，请刷新")

    if len(payload.segments) > 500:
        raise DomainError(422, "TOO_MANY_SEGMENTS", "单个任务最多 500 个片段")

    video = assignment.task.video
    intervals = [
        Interval(start_ms=item.start_ms, end_ms=item.end_ms, id=item.id)
        for item in payload.segments
    ]
    total_duration_ms = validate_segments(intervals, video.duration_ms)

    payload_ids = [item.id for item in payload.segments if item.id is not None]
    if len(payload_ids) != len(set(payload_ids)):
        raise DomainError(400, "VALIDATION_ERROR", "片段 ID 重复")

    existing = {segment.id: segment for segment in assignment.segments}
    unknown_ids = [item_id for item_id in payload_ids if item_id not in existing]
    if unknown_ids:
        raise DomainError(404, "NOT_FOUND", "片段不存在")

    keep_ids: set[uuid.UUID] = set()
    for item in payload.segments:
        if item.id is not None:
            segment = existing[item.id]
            segment.start_ms = item.start_ms
            segment.end_ms = item.end_ms
            keep_ids.add(item.id)
        else:
            db.add(
                Segment(
                    assignment_id=assignment.id,
                    start_ms=item.start_ms,
                    end_ms=item.end_ms,
                )
            )

    for segment_id, segment in existing.items():
        if segment_id not in keep_ids:
            db.delete(segment)

    assignment.version += 1
    db.commit()

    refreshed = db.scalars(
        select(Segment)
        .where(Segment.assignment_id == assignment.id)
        .order_by(Segment.start_ms)
    )
    segments = [segment_out(item) for item in refreshed]
    return DraftOut(
        version=assignment.version,
        segments=segments,
        total_duration_ms=total_duration_ms,
        updated_at=assignment.updated_at,
    )


def submit_assignment(
    db: Session, user: User, assignment_id: uuid.UUID, payload: SubmitRequest
) -> SubmitOut:
    assignment = _locked_assignment(db, user, assignment_id)
    if assignment.status == AssignmentStatus.SUBMITTED:
        raise DomainError(409, "ALREADY_SUBMITTED", "任务已提交")
    if assignment.status != AssignmentStatus.CLAIMED:
        raise DomainError(409, "ASSIGNMENT_NOT_EDITABLE", "任务不可提交")
    if assignment.version != payload.version:
        raise DomainError(409, "VERSION_CONFLICT", "草稿已在其他窗口修改，请刷新")

    segments = list(assignment.segments)
    if not segments and not payload.confirm_empty:
        raise DomainError(
            422,
            "EMPTY_SUBMISSION_CONFIRMATION_REQUIRED",
            "没有标注任何片段，请确认后提交",
        )

    intervals = [
        Interval(start_ms=item.start_ms, end_ms=item.end_ms, id=item.id)
        for item in segments
    ]
    total_duration_ms = validate_segments(
        intervals, assignment.task.video.duration_ms
    )

    submitted_at = datetime.now(UTC)
    assignment.status = AssignmentStatus.SUBMITTED
    assignment.submitted_at = submitted_at
    assignment.total_duration_ms = total_duration_ms
    assignment.task.status = TaskStatus.SUBMITTED
    assignment.version += 1
    db.commit()

    return SubmitOut(
        assignment_id=assignment.id,
        submitted_at=submitted_at,
        total_duration_ms=total_duration_ms,
        task_status=TaskStatus.SUBMITTED,
    )
