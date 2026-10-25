from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Uuid,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssignmentStatus(str, enum.Enum):
    CLAIMED = "CLAIMED"
    SUBMITTED = "SUBMITTED"
    RELEASED = "RELEASED"


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint(
            "(status = 'SUBMITTED' AND submitted_at IS NOT NULL AND total_duration_ms IS NOT NULL) "
            "OR (status <> 'SUBMITTED' AND submitted_at IS NULL AND total_duration_ms IS NULL)",
            name="ck_assignments_submitted_fields",
        ),
        Index(
            "one_active_assignment_per_task",
            "task_id",
            unique=True,
            postgresql_where=text("status IN ('CLAIMED', 'SUBMITTED')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=False, index=True
    )
    annotator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        SAEnum(AssignmentStatus, native_enum=False, length=32, validate_strings=True),
        default=AssignmentStatus.CLAIMED,
        nullable=False,
    )
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    total_duration_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="assignments")
    annotator: Mapped[User] = relationship(
        back_populates="assignments", lazy="selectin"
    )
    segments: Mapped[list[Segment]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="Segment.start_ms",
    )
