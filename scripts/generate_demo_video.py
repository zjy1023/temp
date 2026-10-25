"""Generate a small synthetic demo video with ffmpeg.

The challenge's real datasets are hosted on Hugging Face and are not committed
to this repository. This script creates an offline demo asset so the full flow
can be exercised without network access.

Usage:
    python scripts/generate_demo_video.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "storage" / "videos" / "demo" / "demo.mp4"


def main() -> None:
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg not found. Install ffmpeg and make sure it is on PATH.")
    if shutil.which("ffprobe") is None:
        sys.exit("ffprobe not found. It is normally installed with ffmpeg.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        OUTPUT.unlink()

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
        "60",
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
        str(OUTPUT),
    ]

    print("Running:", " ".join(command))
    subprocess.run(command, check=True)

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size",
            "-of",
            "default=noprint_wrappers=1",
            str(OUTPUT),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    print(f"Created: {OUTPUT}")
    print(probe.stdout.strip())


if __name__ == "__main__":
    main()
