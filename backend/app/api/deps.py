from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domain.errors import DomainError
from app.models import User, UserRole


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    raw_user_id = request.session.get("user_id")
    if not raw_user_id:
        raise DomainError(401, "UNAUTHENTICATED", "请先登录")
    try:
        user_id = uuid.UUID(str(raw_user_id))
    except ValueError as exc:
        raise DomainError(401, "UNAUTHENTICATED", "会话无效") from exc

    user = db.get(User, user_id)
    if user is None:
        raise DomainError(401, "UNAUTHENTICATED", "会话无效")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.PLATFORM_ADMIN, UserRole.TENANT_ADMIN):
        raise DomainError(403, "FORBIDDEN", "没有权限执行此操作")
    return user


def require_annotator(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ANNOTATOR:
        raise DomainError(403, "FORBIDDEN", "只有标注员可以执行此操作")
    return user


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.PLATFORM_ADMIN:
        raise DomainError(403, "FORBIDDEN", "只有平台管理员可以执行此操作")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
AnnotatorUser = Annotated[User, Depends(require_annotator)]
PlatformAdminUser = Annotated[User, Depends(require_platform_admin)]


