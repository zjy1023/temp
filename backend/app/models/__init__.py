"""SQLAlchemy models. Importing this module registers all tables with Base.metadata."""

from app.models.assignment import Assignment, AssignmentStatus
from app.models.segment import Segment
from app.models.task import Task, TaskStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.video import Video

__all__ = [
    "Assignment",
    "AssignmentStatus",
    "Segment",
    "Task",
    "TaskStatus",
    "Tenant",
    "User",
    "UserRole",
    "Video",
]
