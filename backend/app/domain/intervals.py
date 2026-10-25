from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.domain.errors import DomainError


@dataclass(frozen=True)
class Interval:
    start_ms: int
    end_ms: int
    id: Any | None = None


def validate_segment_ranges(segments: list[Interval], duration_ms: int) -> None:
    for segment in segments:
        if segment.start_ms < 0 or segment.end_ms <= segment.start_ms:
            raise DomainError(
                422,
                "INVALID_RANGE",
                "片段起止时间不合法",
                {"start_ms": segment.start_ms, "end_ms": segment.end_ms},
            )
        if segment.end_ms > duration_ms:
            raise DomainError(
                422,
                "OUT_OF_BOUNDS",
                "片段结束时间超出视频时长",
                {"end_ms": segment.end_ms, "duration_ms": duration_ms},
            )


def validate_no_overlap(segments: list[Interval]) -> None:
    ordered = sorted(segments, key=lambda item: (item.start_ms, item.end_ms))
    previous: Interval | None = None
    for segment in ordered:
        if previous is not None and segment.start_ms < previous.end_ms:
            conflict_ids = [
                str(item.id) for item in (previous, segment) if item.id is not None
            ]
            raise DomainError(
                422,
                "OVERLAP",
                "时间段与已有片段重叠",
                {"conflict_segment_ids": conflict_ids},
            )
        previous = segment


def validate_segments(segments: list[Interval], duration_ms: int) -> int:
    validate_segment_ranges(segments, duration_ms)
    validate_no_overlap(segments)
    return sum(item.end_ms - item.start_ms for item in segments)
