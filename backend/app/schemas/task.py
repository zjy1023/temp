from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import AssignmentStatus, TaskStatus
from app.schemas.auth import TenantOut, UserOut
from app.schemas.video import VideoOut


class TaskCreate(BaseModel):
    tenant_id: uuid.UUID | None = None
    video_id: uuid.UUID
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class SegmentIn(BaseModel):
    id: uuid.UUID | None = None
    start_ms: int = Field(ge=0)
    end_ms: int


class DraftUpdate(BaseModel):
    version: int = Field(ge=1)
    segments: list[SegmentIn] = Field(default_factory=list, max_length=500)


class SubmitRequest(BaseModel):
    version: int = Field(ge=1)
    confirm_empty: bool = False


class SegmentOut(BaseModel):
    id: uuid.UUID
    start_ms: int
    end_ms: int


class VideoBrief(BaseModel):
    id: uuid.UUID
    duration_ms: int
    fps: float | None
    codec: str | None
    poster_url: str | None


class UserBrief(BaseModel):
    id: uuid.UUID
    display_name: str


class AssignmentBrief(BaseModel):
    id: uuid.UUID
    status: AssignmentStatus
    annotator: UserBrief | None
    claimed_at: datetime
    submitted_at: datetime | None
    total_duration_ms: int | None
    version: int


class TaskOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    description: str | None
    status: TaskStatus
    created_at: datetime
    published_at: datetime


class TaskSummary(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_name: str
    title: str
    status: TaskStatus
    video: VideoBrief
    annotator: UserBrief | None
    submitted_at: datetime | None
    total_duration_ms: int | None
    created_at: datetime


class TaskDetail(BaseModel):
    task: TaskOut
    tenant: TenantOut
    video: VideoOut
    assignment: AssignmentBrief | None
    segments: list[SegmentOut]


class AvailableTask(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    video: VideoBrief
    created_at: datetime


class MineTask(BaseModel):
    task_id: uuid.UUID
    assignment_id: uuid.UUID
    title: str
    status: AssignmentStatus
    segment_count: int
    total_duration_ms: int | None
    video: VideoBrief


class AnnotatorTasksOut(BaseModel):
    available: list[AvailableTask]
    mine: list[MineTask]


class ClaimOut(BaseModel):
    assignment: AssignmentBrief
    task: TaskOut
    video: VideoBrief


class AssignmentDetail(BaseModel):
    assignment: AssignmentBrief
    task: TaskOut
    video: VideoBrief
    segments: list[SegmentOut]


class DraftOut(BaseModel):
    version: int
    segments: list[SegmentOut]
    total_duration_ms: int
    updated_at: datetime


class SubmitOut(BaseModel):
    assignment_id: uuid.UUID
    submitted_at: datetime
    total_duration_ms: int
    task_status: TaskStatus


class ReassignRequest(BaseModel):
    annotator_id: uuid.UUID


class AnnotatorOut(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str


class AdminTaskListOut(BaseModel):
    tasks: list[TaskSummary]


def video_brief(video) -> VideoBrief:
    return VideoBrief(
        id=video.id,
        duration_ms=video.duration_ms,
        fps=float(video.fps) if video.fps is not None else None,
        codec=video.codec,
        poster_url=f"/api/videos/{video.id}/poster" if video.poster_key else None,
    )


def user_brief(user) -> UserBrief:
    return UserBrief(id=user.id, display_name=user.display_name)


def task_out(task) -> TaskOut:
    return TaskOut(
        id=task.id,
        tenant_id=task.tenant_id,
        title=task.title,
        description=task.description,
        status=task.status,
        created_at=task.created_at,
        published_at=task.published_at,
    )


def assignment_brief(assignment) -> AssignmentBrief:
    return AssignmentBrief(
        id=assignment.id,
        status=assignment.status,
        annotator=user_brief(assignment.annotator) if assignment.annotator else None,
        claimed_at=assignment.claimed_at,
        submitted_at=assignment.submitted_at,
        total_duration_ms=assignment.total_duration_ms,
        version=assignment.version,
    )


def segment_out(segment) -> SegmentOut:
    return SegmentOut(id=segment.id, start_ms=segment.start_ms, end_ms=segment.end_ms)


def user_out(user) -> UserOut:
    return UserOut.model_validate(user)
