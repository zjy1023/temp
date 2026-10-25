from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    TENANT_ADMIN = "TENANT_ADMIN"
    ANNOTATOR = "ANNOTATOR"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(role = 'PLATFORM_ADMIN' AND tenant_id IS NULL) "
            "OR (role <> 'PLATFORM_ADMIN' AND tenant_id IS NOT NULL)",
            name="ck_users_role_tenant",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True, index=True
    )
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, native_enum=False, length=32, validate_strings=True),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped[Tenant] = relationship(back_populates="users")
    assignments: Mapped[list[Assignment]] = relationship(back_populates="annotator")
