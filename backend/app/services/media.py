from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class MediaError(Exception):
    pass


@dataclass(frozen=True)
class VideoProbe:
    duration_ms: int
    fps: float | None
    width: int | None
    height: int | None
    codec: str | None


def _parse_fraction(value: str | None) -> float | None:
    if not value or value in {"0/0", "0"}:
        return None
    try:
        if "/" in value:
            numerator, denominator = value.split("/", 1)
            denominator_value = float(denominator)
            if denominator_value == 0:
                return None
            result = float(numerator) / denominator_value
        else:
            result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result > 0 else None


def probe_video(path: Path) -> VideoProbe:
    if shutil.which("ffprobe") is None:
        raise MediaError("ffprobe 未安装")
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise MediaError(result.stderr.strip() or "ffprobe 执行失败")

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise MediaError("ffprobe 输出无法解析") from exc

    video_stream = next(
        (stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"),
        None,
    )
    if video_stream is None:
        raise MediaError("文件里没有视频流")

    duration_raw = payload.get("format", {}).get("duration") or video_stream.get("duration")
    try:
        duration_ms = int(round(float(duration_raw) * 1000))
    except (TypeError, ValueError) as exc:
        raise MediaError("无法读取视频时长") from exc
    if duration_ms <= 0:
        raise MediaError("视频时长必须大于 0")

    avg_fps = _parse_fraction(video_stream.get("avg_frame_rate"))
    real_fps = _parse_fraction(video_stream.get("r_frame_rate"))
    fps = avg_fps or real_fps
    # VFR：平均帧率和名义帧率不一致时，前端不做帧吸附。
    if avg_fps is not None and real_fps is not None and abs(avg_fps - real_fps) > 0.01:
        fps = None

    return VideoProbe(
        duration_ms=duration_ms,
        fps=fps,
        width=int(video_stream["width"]) if video_stream.get("width") else None,
        height=int(video_stream["height"]) if video_stream.get("height") else None,
        codec=video_stream.get("codec_name"),
    )


def generate_demo_video(output: Path, duration_seconds: int = 60) -> Path:
    if shutil.which("ffmpeg") is None:
        raise MediaError("ffmpeg 未安装")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        return output
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        str(duration_seconds),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise MediaError(result.stderr.strip() or "生成演示视频失败")
    return output


def ensure_demo_video(storage_path: Path) -> Path:
    output = storage_path / "demo" / "demo.mp4"
    if output.exists():
        return output
    legacy = storage_path.parent / "demo" / "demo.mp4"
    if legacy.exists():
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy, output)
        return output
    return generate_demo_video(output)


def remux_faststart(source: Path, target: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise MediaError("ffmpeg 未安装")
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(target),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise MediaError(result.stderr.strip() or "faststart remux 失败")


def transcode_h264(source: Path, target: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise MediaError("ffmpeg 未安装")
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(target),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise MediaError(result.stderr.strip() or "H.264 转码失败")


def make_poster(source: Path, target: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise MediaError("ffmpeg 未安装")
    target.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-ss",
            "1",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            str(target),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise MediaError(result.stderr.strip() or "生成封面失败")
