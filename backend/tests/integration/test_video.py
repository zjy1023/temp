import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def login(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    )
    assert response.status_code == 200, response.text


def test_range_requests(client: TestClient, seed_data: dict) -> None:
    login(client, seed_data["ann_a1"])
    video_id = seed_data["video_a"]

    full = client.get(f"/api/videos/{video_id}/stream")
    assert full.status_code == 200
    assert full.headers["accept-ranges"] == "bytes"
    assert len(full.content) == 4000

    partial = client.get(
        f"/api/videos/{video_id}/stream",
        headers={"Range": "bytes=0-9"},
    )
    assert partial.status_code == 206
    assert partial.content == b"0123456789"
    assert partial.headers["content-range"] == "bytes 0-9/4000"

    suffix = client.get(
        f"/api/videos/{video_id}/stream",
        headers={"Range": "bytes=-10"},
    )
    assert suffix.status_code == 206
    assert suffix.headers["content-range"] == "bytes 3990-3999/4000"

    invalid = client.get(
        f"/api/videos/{video_id}/stream",
        headers={"Range": "bytes=99999-"},
    )
    assert invalid.status_code == 416
    assert invalid.headers["content-range"] == "bytes */4000"

    head = client.head(f"/api/videos/{video_id}/stream")
    assert head.status_code == 200
    assert head.headers["content-length"] == "4000"

    client.post("/api/auth/logout")
    login(client, seed_data["ann_b1"])
    denied = client.get(f"/api/videos/{video_id}/stream")
    assert denied.status_code == 404


def test_upload_probe_and_unsupported_type(
    client: TestClient, seed_data: dict, tmp_path: Path
) -> None:
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is not installed")
    source = tmp_path / "upload-source.mp4"
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=10",
            "-t",
            "2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(source),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.skip(f"ffmpeg failed: {result.stderr}")

    login(client, seed_data["admin_a"])
    with source.open("rb") as handle:
        upload = client.post(
            "/api/admin/videos",
            files={"file": ("upload.mp4", handle, "video/mp4")},
        )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["duration_ms"] > 0
    assert body["codec"] == "h264"
    assert body["poster_url"] is not None

    partial = client.get(
        f'/api/videos/{body["id"]}/stream',
        headers={"Range": "bytes=0-99"},
    )
    assert partial.status_code == 206
    assert partial.headers["content-range"].startswith("bytes 0-99/")

    unsupported = client.post(
        "/api/admin/videos",
        files={"file": ("note.txt", b"hello", "text/plain")},
    )
    assert unsupported.status_code == 415
    assert unsupported.json()["code"] == "UNSUPPORTED_VIDEO_TYPE"
