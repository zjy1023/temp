from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.tenancy import resolve_tenant_id
from app.domain.errors import DomainError
from app.models import (
    Assignment,
    AssignmentStatus,
    Segment,
    Task,
    TaskStatus,
    User,
    UserRole,
    Video,
)
from app.schemas.task import (
    AdminTaskListOut,
    AnnotatorOut,
    AnnotatorTasksOut,
    AssignmentDetail,
    AvailableTask,
    ClaimOut,
    MineTask,
    ReassignRequest,
    TaskCreate,
    TaskDetail,
    TaskSummary,
    assignment_brief,
    segment_out,
    task_out,
    user_brief,
    video_brief,
)
from app.schemas.video import video_to_out


def _active_assignment(task: Task) -> Assignment | None:
    for assignment in task.assignments:
        if assignment.status in (AssignmentStatus.CLAIMED, AssignmentStatus.SUBMITTED):
            return assignment
    return None


def create_task(db: Session, user: User, payload: TaskCreate) -> Task:
    tenant_id = resolve_tenant_id(user, payload.tenant_id, required=True)
    assert tenant_id is not None

    video = db.get(Video, payload.video_id)
    if video is None:
        raise DomainError(404, "NOT_FOUND", "视频不存在")
    if video.tenant_id != tenant_id:
        if user.role == UserRole.PLATFORM_ADMIN:
            raise DomainError(
                422,
                "TENANT_MISMATCH",
                "任务租户与视频租户不一致",
            )
        raise DomainError(404, "NOT_FOUND", "视频不存在")

    title = payload.title.strip()
    if not title:
        raise DomainError(400, "VALIDATION_ERROR", "任务标题不能为空")
    description = payload.description.strip() if payload.description else None

    task = Task(
        tenant_id=tenant_id,
        video_id=video.id,
        title=title,
        description=description,
        status=TaskStatus.PUBLISHED,
        created_by=user.id,
        published_at=datetime.now(UTC),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def list_admin_tasks(
    db: Session,
    user: User,
    *,
    requested_tenant_id: uuid.UUID | None = None,
    status: TaskStatus | None = None,
) -> AdminTaskListOut:
    tenant_id = resolve_tenant_id(user, requested_tenant_id)
    statement = (
        select(Task)
        .options(
            selectinload(Task.tenant),
            selectinload(Task.video),
            selectinload(Task.assignments).selectinload(Assignment.annotator),
        )
        .order_by(Task.created_at.desc())
    )
    if tenant_id is not None:
        statement = statement.where(Task.tenant_id == tenant_id)
    if status is not None:
        statement = statement.where(Task.status == status)

    summaries: list[TaskSummary] = []
    for task in db.scalars(statement).unique():
        active = _active_assignment(task)
        summaries.append(
            TaskSummary(
                id=task.id,
                tenant_id=task.tenant_id,
                tenant_name=task.tenant.name,
                title=task.title,
                status=task.status,
                video=video_brief(task.video),
                annotator=user_brief(active.annotator)
                if active and active.annotator
                else None,
                submitted_at=active.submitted_at
                if active and active.status == AssignmentStatus.SUBMITTED
                else None,
                total_duration_ms=active.total_duration_ms
                if active and active.status == AssignmentStatus.SUBMITTED
                else None,
                created_at=task.created_at,
            )
        )
    return AdminTaskListOut(tasks=summaries)


def get_admin_task(db: Session, user: User, task_id: uuid.UUID) -> TaskDetail:
    statement = (
        select(Task)
        .options(
            selectinload(Task.tenant),
            selectinload(Task.video),
            selectinload(Task.assignments).selectinload(Assignment.annotator),
            selectinload(Task.assignments).selectinload(Assignment.segments),
        )
        .where(Task.id == task_id)
    )
    task = db.scalar(statement)
    if task is None:
        raise DomainError(404, "NOT_FOUND", "任务不存在")
    if user.role != UserRole.PLATFORM_ADMIN and task.tenant_id != user.tenant_id:
        raise DomainError(404, "NOT_FOUND", "任务不存在")

    active = _active_assignment(task)
    segments = (
        [segment_out(item) for item in active.segments]
        if active and active.status == AssignmentStatus.SUBMITTED
        else []
    )
    return TaskDetail(
        task=task_out(task),
        tenant=task.tenant,
        video=video_to_out(task.video),
        assignment=assignment_brief(active) if active else None,
        segments=segments,
    )


def list_annotator_tasks(db: Session, user: User) -> AnnotatorTasksOut:
    if user.tenant_id is None:
        raise DomainError(403, "FORBIDDEN", "账号未绑定租户")

    available_statement = (
        select(Task)
        .options(selectinload(Task.video))
        .where(
            Task.tenant_id == user.tenant_id,
            Task.status == TaskStatus.PUBLISHED,
        )
        .order_by(Task.created_at.desc())
    )
    available = [
        AvailableTask(
            id=task.id,
            title=task.title,
            description=task.description,
            video=video_brief(task.video),
            created_at=task.created_at,
        )
        for task in db.scalars(available_statement)
    ]

    mine_statement = (
        select(Assignment)
        .options(
            selectinload(Assignment.task).selectinload(Task.video),
            selectinload(Assignment.segments),
        )
        .where(
            Assignment.annotator_id == user.id,
            Assignment.tenant_id == user.tenant_id,
            Assignment.status.in_(
                [AssignmentStatus.CLAIMED, AssignmentStatus.SUBMITTED]
            ),
        )
        .order_by(Assignment.claimed_at.desc())
    )
    mine = [
        MineTask(
            task_id=assignment.task_id,
            assignment_id=assignment.id,
            title=assignment.task.title,
            status=assignment.status,
            segment_count=len(assignment.segments),
            total_duration_ms=assignment.total_duration_ms,
            video=video_brief(assignment.task.video),
        )
        for assignment in db.scalars(mine_statement)
    ]
    return AnnotatorTasksOut(available=available, mine=mine)


def claim_task(db: Session, user: User, task_id: uuid.UUID) -> ClaimOut:
    if user.tenant_id is None:
        raise DomainError(403, "FORBIDDEN", "账号未绑定租户")

    task = db.scalar(
        select(Task)
        .where(Task.id == task_id, Task.tenant_id == user.tenant_id)
        .with_for_update()
    )
    if task is None:
        raise DomainError(404, "NOT_FOUND", "任务不存在")

    existing = db.scalar(
        select(Assignment).where(
            Assignment.task_id == task.id,
            Assignment.annotator_id == user.id,
            Assignment.status.in_(
                [AssignmentStatus.CLAIMED, AssignmentStatus.SUBMITTED]
            ),
        )
    )
    if existing is not None:
        return ClaimOut(
            assignment=assignment_brief(existing),
            task=task_out(task),
            video=video_brief(task.video),
        )

    if task.status != TaskStatus.PUBLISHED:
        raise DomainError(409, "ALREADY_CLAIMED", "任务已被其他标注员领取")

    assignment = Assignment(
        task_id=task.id,
        tenant_id=task.tenant_id,
        annotator_id=user.id,
        status=AssignmentStatus.CLAIMED,
        claimed_at=datetime.now(UTC),
        version=1,
    )
    task.status = TaskStatus.CLAIMED
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError(409, "ALREADY_CLAIMED", "任务已被其他标注员领取") from exc

    db.refresh(assignment)
    db.refresh(task)
    return ClaimOut(
        assignment=assignment_brief(assignment),
        task=task_out(task),
        video=video_brief(task.video),
    )


def release_assignment(db: Session, user: User, assignment_id: uuid.UUID) -> None:
    assignment = db.scalar(
        select(Assignment)
        .where(
            Assignment.id == assignment_id,
            Assignment.annotator_id == user.id,
            Assignment.tenant_id == user.tenant_id,
        )
        .with_for_update()
    )
    if assignment is None:
        raise DomainError(404, "NOT_FOUND", "任务不存在")
    if assignment.status != AssignmentStatus.CLAIMED:
        raise DomainError(409, "ASSIGNMENT_NOT_EDITABLE", "任务已不可释放")

    task = db.scalar(
        select(Task).where(Task.id == assignment.task_id).with_for_update()
    )
    db.execute(delete(Segment).where(Segment.assignment_id == assignment.id))
    assignment.status = AssignmentStatus.RELEASED
    assignment.version += 1
    if task is not None:
        task.status = TaskStatus.PUBLISHED
    db.commit()


def get_annotator_assignment(
    db: Session, user: User, assignment_id: uuid.UUID
) -> AssignmentDetail:
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
    )
    if assignment is None or assignment.status == AssignmentStatus.RELEASED:
        raise DomainError(404, "NOT_FOUND", "标注任务不存在")

    return AssignmentDetail(
        assignment=assignment_brief(assignment),
        task=task_out(assignment.task),
        video=video_brief(assignment.task.video),
        segments=[segment_out(item) for item in assignment.segments],
    )


def list_annotators(
    db: Session, user: User, requested_tenant_id: uuid.UUID | None
) -> list[AnnotatorOut]:
    tenant_id = resolve_tenant_id(user, requested_tenant_id)
    statement = select(User).where(User.role == UserRole.ANNOTATOR)
    if tenant_id is not None:
        statement = statement.where(User.tenant_id == tenant_id)
    statement = statement.order_by(User.display_name)
    return [
        AnnotatorOut(id=item.id, display_name=item.display_name, email=item.email)
        for item in db.scalars(statement)
    ]


def reassign_task(
    db: Session, user: User, task_id: uuid.UUID, payload: ReassignRequest
) -> TaskDetail:
    task = db.scalar(select(Task).where(Task.id == task_id).with_for_update())
    if task is None:
        raise DomainError(404, "NOT_FOUND", "任务不存在")
    if user.role != UserRole.PLATFORM_ADMIN and task.tenant_id != user.tenant_id:
        raise DomainError(404, "NOT_FOUND", "任务不存在")
    if task.status != TaskStatus.CLAIMED:
        raise DomainError(409, "ASSIGNMENT_NOT_EDITABLE", "只有进行中的任务可以重新分配")

    old_assignment = db.scalar(
        select(Assignment)
        .where(
            Assignment.task_id == task.id,
            Assignment.status.in_(
                [AssignmentStatus.CLAIMED, AssignmentStatus.SUBMITTED]
            ),
        )
        .with_for_update()
    )
    if old_assignment is None:
        raise DomainError(409, "ASSIGNMENT_NOT_EDITABLE", "任务没有进行中的标注")
    if old_assignment.annotator_id == payload.annotator_id:
        raise DomainError(400, "VALIDATION_ERROR", "任务已分配给该标注员")

    annotator = db.get(User, payload.annotator_id)
    if (
        annotator is None
        or annotator.role != UserRole.ANNOTATOR
        or annotator.tenant_id != task.tenant_id
    ):
        raise DomainError(404, "NOT_FOUND", "标注员不存在")

    db.execute(delete(Segment).where(Segment.assignment_id == old_assignment.id))
    old_assignment.status = AssignmentStatus.RELEASED
    old_assignment.version += 1
    db.flush()

    new_assignment = Assignment(
        task_id=task.id,
        tenant_id=task.tenant_id,
        annotator_id=annotator.id,
        status=AssignmentStatus.CLAIMED,
        claimed_at=datetime.now(UTC),
        version=1,
    )
    db.add(new_assignment)
    db.commit()
    return get_admin_task(db, user, task.id)
