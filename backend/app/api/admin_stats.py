from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.db.session import get_db
from app.schemas.stats import StatsOut
from app.services.stats import daily_stats

router = APIRouter(prefix="/admin/stats", tags=["admin-stats"])


@router.get("/daily", response_model=StatsOut, response_model_by_alias=True)
def daily(
    user: AdminUser,
    date_from: date = Query(alias="from"),
    date_to: date = Query(alias="to"),
    tenant_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> StatsOut:
    return daily_stats(
        db,
        user,
        date_from=date_from,
        date_to=date_to,
        requested_tenant_id=tenant_id,
    )
