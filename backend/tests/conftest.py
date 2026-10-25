from __future__ import annotations

import os
import uuid
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Task, TaskStatus, Tenant, User, UserRole, Video

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://app:app@localhost:5432/app_test",
)
TEST_PASSWORD = "Passw0rd!"
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)

engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestSessionLocal = sessionmaker(
    bind=engine, class_=Session, autoflush=False, expire_on_commit=False
)


def _ensure_test_database() -> None:
    admin_dsn = "postgresql://app:app@localhost:5432/postgres"
    with psycopg.connect(admin_dsn, autocommit=True) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_database WHERE datname = 'app_test'"
        ).fetchone()
        if not exists:
            connection.execute("CREATE DATABASE app_test")


@pytest.fixture(scope="session", autouse=True)
def prepare_database() -> None:
    _ensure_test_database()
    Base.metadata.create_all(engine)


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    with TestSessionLocal() as session:
        yield session


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    def override_get_db():
        with TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    with TestSessionLocal() as session:
        table_names = ", ".join(
            f'"{table.name}"' for table in Base.metadata.sorted_tables
        )
        session.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
        session.commit()


@pytest.fixture()
def seed_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    storage = tmp_path
    storage.mkdir(parents=True, exist_ok=True)

    with TestSessionLocal() as session:
        tenant_a = Tenant(name="Alpha Test")
        tenant_b = Tenant(name="Beta Test")
        session.add_all([tenant_a, tenant_b])
        session.flush()

        platform = User(
            tenant_id=None,
            role=UserRole.PLATFORM_ADMIN,
            email="platform.test@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="平台管理员",
        )
        admin_a = User(
            tenant_id=tenant_a.id,
            role=UserRole.TENANT_ADMIN,
            email="admin.a@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="A 管理员",
        )
        admin_b = User(
            tenant_id=tenant_b.id,
            role=UserRole.TENANT_ADMIN,
            email="admin.b@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="B 管理员",
        )
        ann_a1 = User(
            tenant_id=tenant_a.id,
            role=UserRole.ANNOTATOR,
            email="ann.a1@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="A 标注员 1",
        )
        ann_a2 = User(
            tenant_id=tenant_a.id,
            role=UserRole.ANNOTATOR,
            email="ann.a2@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="A 标注员 2",
        )
        ann_b1 = User(
            tenant_id=tenant_b.id,
            role=UserRole.ANNOTATOR,
            email="ann.b1@example.com",
            password_hash=TEST_PASSWORD_HASH,
            display_name="B 标注员 1",
        )
        session.add_all([platform, admin_a, admin_b, ann_a1, ann_a2, ann_b1])
        session.flush()

        video_a_id = uuid.uuid4()
        video_b_id = uuid.uuid4()
        file_bytes = b"0123456789" * 400
        for tenant, video_id in ((tenant_a, video_a_id), (tenant_b, video_b_id)):
            tenant_dir = storage / str(tenant.id)
            tenant_dir.mkdir(parents=True, exist_ok=True)
            (tenant_dir / "demo.mp4").write_bytes(file_bytes)
            session.add(
                Video(
                    id=video_id,
                    tenant_id=tenant.id,
                    original_name="demo.mp4",
                    storage_key=f"{tenant.id}/demo.mp4",
                    poster_key=None,
                    content_type="video/mp4",
                    size_bytes=len(file_bytes),
                    duration_ms=60000,
                    fps=30,
                    width=320,
                    height=240,
                    codec="h264",
                    created_by=admin_a.id if tenant is tenant_a else admin_b.id,
                )
            )

        task_a = Task(
            tenant_id=tenant_a.id,
            video_id=video_a_id,
            title="A 任务",
            description="A tenant task",
            status=TaskStatus.PUBLISHED,
            created_by=admin_a.id,
            published_at=datetime.now(UTC),
        )
        task_b = Task(
            tenant_id=tenant_b.id,
            video_id=video_b_id,
            title="B 任务",
            description="B tenant task",
            status=TaskStatus.PUBLISHED,
            created_by=admin_b.id,
            published_at=datetime.now(UTC),
        )
        session.add_all([task_a, task_b])
        session.commit()

        return {
            "tenant_a": tenant_a.id,
            "tenant_b": tenant_b.id,
            "platform": platform.email,
            "admin_a": admin_a.email,
            "admin_b": admin_b.email,
            "ann_a1": ann_a1.email,
            "ann_a2": ann_a2.email,
            "ann_b1": ann_b1.email,
            "video_a": video_a_id,
            "video_b": video_b_id,
            "task_a": task_a.id,
            "task_b": task_b.id,
        }


def login(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
