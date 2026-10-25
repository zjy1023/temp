from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tenancy import resolve_tenant_id
from app.domain.errors import DomainError
from app.domain.time import business_day_bounds
from app.models import Assignment, AssignmentStatus, User
from app.schemas.stats import StatsDay, StatsOut


def daily_stats(
    db: Session,
    user: User,
    *,
    date_from: date,
    date_to: date,
    requested_tenant_id: uuid.UUID | None,
) -> StatsOut:
    if date_to < date_from:
        raise DomainError(400, "VALIDATION_ERROR", "日期范围不合法")
    if (date_to - date_from).days > 366:
        raise DomainError(400, "VALIDATION_ERROR", "日期范围不能超过 366 天")

    tenant_id = resolve_tenant_id(user, requested_tenant_id)
    start_utc, end_utc = business_day_bounds(
        date_from, date_to, settings.app_timezone
    )

    local_day = func.date(
        func.timezone(settings.app_timezone, Assignment.submitted_at)
    )
    statement = (
        select(
            local_day.label("day"),
            func.coalesce(func.sum(Assignment.total_duration_ms), 0).label(
                "total_duration_ms"
            ),
            func.count(Assignment.id).label("task_count"),
            func.count(func.distinct(Assignment.annotator_id)).label(
                "annotator_count"
            ),
        )
        .where(
            Assignment.status == AssignmentStatus.SUBMITTED,
            Assignment.submitted_at >= start_utc,
            Assignment.submitted_at < end_utc,
        )
        .group_by(local_day)
        .order_by(local_day)
    )
    if tenant_id is not None:
        statement = statement.where(Assignment.tenant_id == tenant_id)

    rows = db.execute(statement).all()
    by_day = {
        row.day: StatsDay(
            date=row.day,
            total_duration_ms=int(row.total_duration_ms or 0),
            task_count=int(row.task_count or 0),
            annotator_count=int(row.annotator_count or 0),
        )
        for row in rows
    }

    days: list[StatsDay] = []
    cursor = date_from
    while cursor <= date_to:
        days.append(
            by_day.get(
                cursor,
                StatsDay(
                    date=cursor,
                    total_duration_ms=0,
                    task_count=0,
                    annotator_count=0,
                ),
            )
        )
        cursor += timedelta(days=1)

    return StatsOut(
        timezone=settings.app_timezone,
        from_=date_from,
        to=date_to,
        days=days,
    )
