from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import (
    Assignment,
    AssignmentStatus,
    Task,
    TaskStatus,
    User,
)


def test_stats_only_submitted_and_timezone(
    client: TestClient, db, seed_data: dict
) -> None:
    admin = db.scalar(select(User).where(User.email == seed_data["admin_a"]))
    annotator = db.scalar(select(User).where(User.email == seed_data["ann_a1"]))
    assert admin is not None and annotator is not None

    def add_assignment(
        title: str,
        duration_ms: int,
        submitted_at: datetime | None,
        status: AssignmentStatus,
    ) -> None:
        task = Task(
            tenant_id=seed_data["tenant_a"],
            video_id=seed_data["video_a"],
            title=title,
            status=(
                TaskStatus.SUBMITTED
                if status == AssignmentStatus.SUBMITTED
                else TaskStatus.CLAIMED
            ),
            created_by=admin.id,
            published_at=datetime.now(UTC),
        )
        db.add(task)
        db.flush()
        assignment = Assignment(
            task_id=task.id,
            tenant_id=seed_data["tenant_a"],
            annotator_id=annotator.id,
            status=status,
            claimed_at=submitted_at or datetime.now(UTC),
            submitted_at=submitted_at,
            total_duration_ms=duration_ms if submitted_at is not None else None,
            version=1,
        )
        db.add(assignment)

    # 2026-10-23 15:59:59 UTC = 2026-10-23 23:59:59 Asia/Shanghai
    add_assignment(
        "23:59:59 提交",
        1000,
        datetime(2026, 10, 23, 15, 59, 59, tzinfo=UTC),
        AssignmentStatus.SUBMITTED,
    )
    # 2026-10-23 16:00:01 UTC = 2026-10-24 00:00:01 Asia/Shanghai
    add_assignment(
        "00:00:01 提交",
        2000,
        datetime(2026, 10, 23, 16, 0, 1, tzinfo=UTC),
        AssignmentStatus.SUBMITTED,
    )
    # 空提交：计任务数，不计时长
    add_assignment(
        "空提交",
        0,
        datetime(2026, 10, 23, 16, 0, 2, tzinfo=UTC),
        AssignmentStatus.SUBMITTED,
    )
    # 草稿不计入
    add_assignment("草稿", 5000, None, AssignmentStatus.CLAIMED)
    db.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": seed_data["admin_a"], "password": "Passw0rd!"},
    )
    assert response.status_code == 200
    stats = client.get(
        "/api/admin/stats/daily",
        params={"from": "2026-10-23", "to": "2026-10-24"},
    )
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert body["timezone"] == "Asia/Shanghai"
    assert body["from"] == "2026-10-23"
    assert body["to"] == "2026-10-24"

    days = {item["date"]: item for item in body["days"]}
    assert days["2026-10-23"]["total_duration_ms"] == 1000
    assert days["2026-10-23"]["task_count"] == 1
    assert days["2026-10-24"]["total_duration_ms"] == 2000
    assert days["2026-10-24"]["task_count"] == 2
    assert days["2026-10-24"]["annotator_count"] == 1


def test_stats_rejects_invalid_range(client: TestClient, seed_data: dict) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": seed_data["admin_a"], "password": "Passw0rd!"},
    )
    assert response.status_code == 200
    invalid = client.get(
        "/api/admin/stats/daily",
        params={"from": "2026-10-24", "to": "2026-10-23"},
    )
    assert invalid.status_code == 400
    assert invalid.json()["code"] == "VALIDATION_ERROR"
