from __future__ import annotations

import uuid

from app.domain.errors import DomainError
from app.models import User, UserRole


def resolve_tenant_id(
    user: User,
    requested_tenant_id: uuid.UUID | None,
    *,
    required: bool = False,
) -> uuid.UUID | None:
    if user.role == UserRole.PLATFORM_ADMIN:
        if required and requested_tenant_id is None:
            raise DomainError(400, "VALIDATION_ERROR", "tenant_id 必填")
        return requested_tenant_id

    if requested_tenant_id is not None and requested_tenant_id != user.tenant_id:
        raise DomainError(404, "NOT_FOUND", "资源不存在")
    if required and user.tenant_id is None:
        raise DomainError(403, "FORBIDDEN", "账号未绑定租户")
    return user.tenant_id


def ensure_tenant_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.PLATFORM_ADMIN:
        return
    if user.tenant_id != tenant_id:
        raise DomainError(404, "NOT_FOUND", "资源不存在")
