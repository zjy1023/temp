from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import PlatformAdminUser
from app.db.session import get_db
from app.models import Tenant
from app.schemas.auth import TenantOut

router = APIRouter(prefix="/admin/tenants", tags=["admin"])


@router.get("", response_model=list[TenantOut])
def list_tenants(
    _: PlatformAdminUser,
    db: Session = Depends(get_db),
) -> list[Tenant]:
    return list(db.scalars(select(Tenant).order_by(Tenant.name)))
