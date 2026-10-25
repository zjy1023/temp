from __future__ import annotations

import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    Assignment,
    AssignmentStatus,
    Segment,
    Task,
    TaskStatus,
    Tenant,
    User,
    UserRole,
    Video,
)
from app.services.media import MediaError, ensure_demo_video, make_poster, probe_video

DEMO_PASSWORD = "Annotator123!"
ADMIN_PASSWORD = "Admin123!"
PLATFORM_PASSWORD = "Platform123!"


def _create_tenant(session, name: str) -> Tenant:
    tenant = Tenant(name=name)
    session.add(tenant)
    session.flush()
    return tenant


def _create_user(
    session,
    *,
    tenant: Tenant | None,
    role: UserRole,
    email: str,
    display_name: str,
    password: str,
) -> User:
    user = User(
        tenant_id=tenant.id if tenant else None,
        role=role,
        email=email.lower(),
        password_hash=hash_password(password),
        display_name=display_name,
    )
    session.add(user)
    session.flush()
    return user


def _create_video(
    session, tenant: Tenant, admin: User, demo_path: Path, probe
) -> Video:
    tenant_dir = settings.storage_path / str(tenant.id)
    tenant_dir.mkdir(parents=True, exist_ok=True)
    video_path = tenant_dir / "demo.mp4"
    shutil.copy2(demo_path, video_path)

    poster_key: str | None = None
    poster_path = tenant_dir / "demo.jpg"
    try:
        make_poster(video_path, poster_path)
        poster_key = f"{tenant.id}/demo.jpg"
    except MediaError:
        poster_key = None

    video = Video(
        tenant_id=tenant.id,
        original_name="demo.mp4",
        storage_key=f"{tenant.id}/demo.mp4",
        poster_key=poster_key,
        content_type="video/mp4",
        size_bytes=video_path.stat().st_size,
        duration_ms=probe.duration_ms,
        fps=probe.fps,
        width=probe.width,
        height=probe.height,
        codec=probe.codec,
        description="ffmpeg testsrc2 合成的离线演示视频",
        created_by=admin.id,
    )
    session.add(video)
    session.flush()
    return video


def _create_task(
    session,
    *,
    tenant: Tenant,
    video: Video,
    admin: User,
    title: str,
    description: str | None = None,
) -> Task:
    task = Task(
        tenant_id=tenant.id,
        video_id=video.id,
        title=title,
        description=description,
        status=TaskStatus.PUBLISHED,
        created_by=admin.id,
        published_at=datetime.now(UTC),
    )
    session.add(task)
    session.flush()
    return task


def _add_claimed_assignment(
    session, task: Task, annotator: User, segments: list[tuple[int, int]]
) -> Assignment:
    assignment = Assignment(
        task_id=task.id,
        tenant_id=task.tenant_id,
        annotator_id=annotator.id,
        status=AssignmentStatus.CLAIMED,
        claimed_at=datetime.now(UTC) - timedelta(hours=2),
        version=2,
    )
    session.add(assignment)
    session.flush()
    for start_ms, end_ms in segments:
        session.add(
            Segment(
                assignment_id=assignment.id,
                start_ms=start_ms,
                end_ms=end_ms,
            )
        )
    task.status = TaskStatus.CLAIMED
    return assignment


def _add_submitted_assignment(
    session,
    task: Task,
    annotator: User,
    segments: list[tuple[int, int]],
    submitted_at: datetime,
) -> Assignment:
    total_duration_ms = sum(end - start for start, end in segments)
    assignment = Assignment(
        task_id=task.id,
        tenant_id=task.tenant_id,
        annotator_id=annotator.id,
        status=AssignmentStatus.SUBMITTED,
        claimed_at=submitted_at - timedelta(hours=1),
        submitted_at=submitted_at,
        total_duration_ms=total_duration_ms,
        version=3,
    )
    session.add(assignment)
    session.flush()
    for start_ms, end_ms in segments:
        session.add(
            Segment(
                assignment_id=assignment.id,
                start_ms=start_ms,
                end_ms=end_ms,
            )
        )
    task.status = TaskStatus.SUBMITTED
    return assignment


def seed() -> None:
    with SessionLocal() as session:
        if session.scalar(select(Tenant).limit(1)) is not None:
            print("Seed skipped: tenants already exist")
            return

        alpha = _create_tenant(session, "Alpha Robotics")
        beta = _create_tenant(session, "Beta Robotics")

        _create_user(
            session,
            tenant=None,
            role=UserRole.PLATFORM_ADMIN,
            email="platform@example.com",
            display_name="平台管理员",
            password=PLATFORM_PASSWORD,
        )
        alpha_admin = _create_user(
            session,
            tenant=alpha,
            role=UserRole.TENANT_ADMIN,
            email="admin.alpha@example.com",
            display_name="Alpha 租户管理员",
            password=ADMIN_PASSWORD,
        )
        beta_admin = _create_user(
            session,
            tenant=beta,
            role=UserRole.TENANT_ADMIN,
            email="admin.beta@example.com",
            display_name="Beta 租户管理员",
            password=ADMIN_PASSWORD,
        )
        alpha_annotator_1 = _create_user(
            session,
            tenant=alpha,
            role=UserRole.ANNOTATOR,
            email="ann.alpha1@example.com",
            display_name="标注员 Alpha 1",
            password=DEMO_PASSWORD,
        )
        alpha_annotator_2 = _create_user(
            session,
            tenant=alpha,
            role=UserRole.ANNOTATOR,
            email="ann.alpha2@example.com",
            display_name="标注员 Alpha 2",
            password=DEMO_PASSWORD,
        )
        beta_annotator = _create_user(
            session,
            tenant=beta,
            role=UserRole.ANNOTATOR,
            email="ann.beta1@example.com",
            display_name="标注员 Beta 1",
            password=DEMO_PASSWORD,
        )

        demo_path = ensure_demo_video(settings.storage_path)
        probe = probe_video(demo_path)

        alpha_video = _create_video(session, alpha, alpha_admin, demo_path, probe)
        beta_video = _create_video(session, beta, beta_admin, demo_path, probe)

        _create_task(
            session,
            tenant=alpha,
            video=alpha_video,
            admin=alpha_admin,
            title="咖啡演示片段标注",
            description="标出抓取、移动、放置三个阶段",
        )

        claimed_task = _create_task(
            session,
            tenant=alpha,
            video=alpha_video,
            admin=alpha_admin,
            title="Push-T 片段标注",
            description="进行中的示例任务",
        )
        _add_claimed_assignment(
            session,
            claimed_task,
            alpha_annotator_1,
            [(2000, 5000), (7000, 9000)],
        )

        submitted_task = _create_task(
            session,
            tenant=alpha,
            video=alpha_video,
            admin=alpha_admin,
            title="已完成的咖啡标注",
            description="已提交的示例任务",
        )
        _add_submitted_assignment(
            session,
            submitted_task,
            alpha_annotator_2,
            [(0, 3000), (6000, 10000)],
            datetime.now(UTC) - timedelta(days=1, hours=2),
        )

        _create_task(
            session,
            tenant=beta,
            video=beta_video,
            admin=beta_admin,
            title="Beta 演示任务",
            description="Beta 租户的可领取任务",
        )
        beta_submitted = _create_task(
            session,
            tenant=beta,
            video=beta_video,
            admin=beta_admin,
            title="Beta 已完成示例",
            description="Beta 租户的已提交任务",
        )
        _add_submitted_assignment(
            session,
            beta_submitted,
            beta_annotator,
            [(1000, 4000)],
            datetime.now(UTC) - timedelta(hours=1),
        )

        session.commit()

    print("Seed complete")
    print("Platform admin: platform@example.com / Platform123!")
    print("Tenant admin:   admin.alpha@example.com / Admin123!")
    print("Tenant admin:   admin.beta@example.com / Admin123!")
    print("Annotator:      ann.alpha1@example.com / Annotator123!")
    print("Annotator:      ann.alpha2@example.com / Annotator123!")
    print("Annotator:      ann.beta1@example.com / Annotator123!")


if __name__ == "__main__":
    seed()
