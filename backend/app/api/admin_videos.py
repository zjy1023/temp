from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.core.tenancy import resolve_tenant_id
from app.db.session import get_db
from app.models import Video
from app.schemas.video import VideoOut, video_to_out
from app.services.videos import save_upload

router = APIRouter(prefix="/admin/videos", tags=["admin-videos"])


@router.post("", response_model=VideoOut, status_code=201)
async def upload_video(
    user: AdminUser,
    file: UploadFile = File(...),
    tenant_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
) -> VideoOut:
    target_tenant_id = resolve_tenant_id(user, tenant_id, required=True)
    video = await save_upload(db, file, target_tenant_id, user)
    return video_to_out(video)


@router.get("", response_model=list[VideoOut])
def list_videos(
    user: AdminUser,
    tenant_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[VideoOut]:
    target_tenant_id = resolve_tenant_id(user, tenant_id)
    statement = select(Video).order_by(Video.created_at.desc())
    if target_tenant_id is not None:
        statement = statement.where(Video.tenant_id == target_tenant_id)
    return [video_to_out(video) for video in db.scalars(statement)]
