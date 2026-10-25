from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.db.session import get_db
from app.models import TaskStatus
from app.schemas.task import (
    AdminTaskListOut,
    ReassignRequest,
    TaskCreate,
    TaskDetail,
    TaskOut,
    task_out,
)
from app.services.tasks import (
    create_task,
    get_admin_task,
    list_admin_tasks,
    reassign_task,
)

router = APIRouter(prefix="/admin/tasks", tags=["admin-tasks"])


@router.post("", response_model=TaskOut, status_code=201)
def create(
    payload: TaskCreate,
    user: AdminUser,
    db: Session = Depends(get_db),
) -> TaskOut:
    task = create_task(db, user, payload)
    return task_out(task)


@router.get("", response_model=AdminTaskListOut)
def list_tasks(
    user: AdminUser,
    tenant_id: uuid.UUID | None = Query(default=None),
    status: TaskStatus | None = Query(default=None),
    db: Session = Depends(get_db),
) -> AdminTaskListOut:
    return list_admin_tasks(
        db,
        user,
        requested_tenant_id=tenant_id,
        status=status,
    )


@router.get("/{task_id}", response_model=TaskDetail)
def detail(
    task_id: uuid.UUID,
    user: AdminUser,
    db: Session = Depends(get_db),
) -> TaskDetail:
    return get_admin_task(db, user, task_id)


@router.post("/{task_id}/reassign", response_model=TaskDetail)
def reassign(
    task_id: uuid.UUID,
    payload: ReassignRequest,
    user: AdminUser,
    db: Session = Depends(get_db),
) -> TaskDetail:
    return reassign_task(db, user, task_id, payload)
