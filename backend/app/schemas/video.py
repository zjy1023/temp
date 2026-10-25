from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class VideoOut(BaseModel):
    id: uuid.UUID
    original_name: str
    duration_ms: int
    fps: float | None
    width: int | None
    height: int | None
    codec: str | None
    size_bytes: int
    poster_url: str | None
    created_at: datetime


def video_to_out(video) -> VideoOut:
    return VideoOut(
        id=video.id,
        original_name=video.original_name,
        duration_ms=video.duration_ms,
        fps=float(video.fps) if video.fps is not None else None,
        width=video.width,
        height=video.height,
        codec=video.codec,
        size_bytes=video.size_bytes,
        poster_url=f"/api/videos/{video.id}/poster" if video.poster_key else None,
        created_at=video.created_at,
    )
