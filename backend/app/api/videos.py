from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.domain.errors import DomainError
from app.models import Video
from app.services.videos import (
    build_stream_response,
    can_access_video,
    poster_path,
)

router = APIRouter(prefix="/videos", tags=["videos"])


def _get_accessible_video(
    video_id: uuid.UUID, user: CurrentUser, db: Session
) -> Video:
    video = db.get(Video, video_id)
    if video is None or not can_access_video(db, user, video):
        raise DomainError(404, "NOT_FOUND", "视频不存在")
    return video


@router.get("/{video_id}/stream")
def stream_video(
    video_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    video = _get_accessible_video(video_id, user, db)
    return build_stream_response(video, request.headers.get("range"), request.method)


@router.head("/{video_id}/stream")
def head_video(
    video_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    video = _get_accessible_video(video_id, user, db)
    return build_stream_response(video, request.headers.get("range"), request.method)


@router.get("/{video_id}/poster")
def video_poster(
    video_id: uuid.UUID,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> FileResponse:
    video = _get_accessible_video(video_id, user, db)
    path = poster_path(video)
    if not path.exists():
        raise DomainError(404, "NOT_FOUND", "封面不存在")
    return FileResponse(path, media_type="image/jpeg")
