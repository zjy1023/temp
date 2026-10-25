from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session
from starlette.responses import Response, StreamingResponse

from app.core.config import settings
from app.domain.errors import DomainError
from app.models import Assignment, AssignmentStatus, Task, TaskStatus, User, UserRole, Video
from app.services.media import (
    MediaError,
    make_poster,
    probe_video,
    remux_faststart,
    transcode_h264,
)

ALLOWED_SUFFIXES = {".mp4": "video/mp4", ".webm": "video/webm"}
CHUNK_SIZE = 1024 * 1024
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def video_path(video: Video) -> Path:
    root = settings.storage_path.resolve()
    path = (root / video.storage_key).resolve()
    if not path.is_relative_to(root):
        raise DomainError(404, "NOT_FOUND", "视频文件不存在")
    return path


def poster_path(video: Video) -> Path:
    if not video.poster_key:
        raise DomainError(404, "NOT_FOUND", "封面不存在")
    root = settings.storage_path.resolve()
    path = (root / video.poster_key).resolve()
    if not path.is_relative_to(root):
        raise DomainError(404, "NOT_FOUND", "封面不存在")
    return path


def can_access_video(db: Session, user: User, video: Video) -> bool:
    if user.role == UserRole.PLATFORM_ADMIN:
        return True
    if user.tenant_id != video.tenant_id:
        return False
    if user.role == UserRole.TENANT_ADMIN:
        return True

    own_assignment = exists(
        select(Assignment.id).where(
            Assignment.task_id == Task.id,
            Assignment.annotator_id == user.id,
            Assignment.status.in_(
                [AssignmentStatus.CLAIMED, AssignmentStatus.SUBMITTED]
            ),
        )
    )
    statement = select(Task.id).where(
        Task.video_id == video.id,
        Task.tenant_id == user.tenant_id,
        or_(Task.status == TaskStatus.PUBLISHED, own_assignment),
    )
    return db.scalar(statement) is not None


async def save_upload(
    db: Session, upload: UploadFile, tenant_id: uuid.UUID, user: User
) -> Video:
    original_name = upload.filename or "upload.mp4"
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise DomainError(415, "UNSUPPORTED_VIDEO_TYPE", "只支持 MP4 或 WebM")
    content_type = ALLOWED_SUFFIXES[suffix]

    root = settings.storage_path
    tmp_dir = root / ".tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = tmp_dir / f"{uuid.uuid4().hex}{suffix}"

    total = 0
    try:
        with temp_path.open("wb") as handle:
            while chunk := await upload.read(CHUNK_SIZE):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise DomainError(413, "FILE_TOO_LARGE", "视频超过 2 GB")
                handle.write(chunk)
        if total == 0:
            raise DomainError(422, "VIDEO_PROBE_FAILED", "上传文件为空")

        try:
            probe = probe_video(temp_path)
        except MediaError as exc:
            raise DomainError(422, "VIDEO_PROBE_FAILED", str(exc)) from exc

        # MP4 统一做 faststart；失败时保留原文件。
        if suffix == ".mp4":
            remuxed = tmp_dir / f"{uuid.uuid4().hex}.faststart.mp4"
            try:
                remux_faststart(temp_path, remuxed)
                temp_path.unlink(missing_ok=True)
                temp_path = remuxed
            except MediaError:
                remuxed.unlink(missing_ok=True)

        if settings.transcode_to_h264 and (probe.codec or "").lower() != "h264":
            transcoded = tmp_dir / f"{uuid.uuid4().hex}.h264.mp4"
            try:
                transcode_h264(temp_path, transcoded)
                temp_path.unlink(missing_ok=True)
                temp_path = transcoded
                probe = probe_video(temp_path)
            except MediaError:
                transcoded.unlink(missing_ok=True)

        tenant_dir = root / str(tenant_id)
        tenant_dir.mkdir(parents=True, exist_ok=True)
        file_id = uuid.uuid4()
        final_name = f"{file_id}{suffix}"
        final_path = tenant_dir / final_name
        shutil.move(str(temp_path), final_path)

        poster_key = None
        poster_file = tenant_dir / f"{file_id}.jpg"
        try:
            make_poster(final_path, poster_file)
            poster_key = f"{tenant_id}/{poster_file.name}"
        except MediaError:
            poster_key = None

        video = Video(
            tenant_id=tenant_id,
            original_name=original_name,
            storage_key=f"{tenant_id}/{final_name}",
            poster_key=poster_key,
            content_type=content_type,
            size_bytes=final_path.stat().st_size,
            duration_ms=probe.duration_ms,
            fps=probe.fps,
            width=probe.width,
            height=probe.height,
            codec=probe.codec,
            created_by=user.id,
        )
        db.add(video)
        db.commit()
        db.refresh(video)
        return video
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def build_stream_response(
    video: Video, range_header: str | None, method: str
) -> Response:
    path = video_path(video)
    if not path.exists():
        raise DomainError(404, "NOT_FOUND", "视频文件不存在")

    file_size = path.stat().st_size
    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": video.content_type,
        "Content-Disposition": f'inline; filename="{video.original_name}"',
        "Cache-Control": "private, max-age=0",
    }

    if method.upper() == "HEAD":
        base_headers["Content-Length"] = str(file_size)
        return Response(status_code=200, headers=base_headers)

    if not range_header:
        def full_iterator():
            with path.open("rb") as handle:
                while chunk := handle.read(CHUNK_SIZE):
                    yield chunk

        base_headers["Content-Length"] = str(file_size)
        return StreamingResponse(
            full_iterator(), status_code=200, headers=base_headers
        )

    match = RANGE_RE.match(range_header.strip())
    if not match:
        return _range_not_satisfiable(file_size)

    start_raw, end_raw = match.groups()
    if start_raw == "" and end_raw == "":
        return _range_not_satisfiable(file_size)

    if start_raw == "":
        # suffix range: last N bytes
        suffix_length = int(end_raw)
        if suffix_length <= 0:
            return _range_not_satisfiable(file_size)
        start = max(file_size - suffix_length, 0)
        end = file_size - 1
    else:
        start = int(start_raw)
        if start >= file_size:
            return _range_not_satisfiable(file_size)
        end = int(end_raw) if end_raw else file_size - 1
        end = min(end, file_size - 1)

    if end < start:
        return _range_not_satisfiable(file_size)

    length = end - start + 1

    def range_iterator():
        remaining = length
        with path.open("rb") as handle:
            handle.seek(start)
            while remaining > 0:
                chunk = handle.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
    }
    return StreamingResponse(
        range_iterator(), status_code=206, headers=headers
    )


def _range_not_satisfiable(file_size: int) -> Response:
    return Response(
        status_code=416,
        headers={
            "Content-Range": f"bytes */{file_size}",
            "Accept-Ranges": "bytes",
        },
    )
