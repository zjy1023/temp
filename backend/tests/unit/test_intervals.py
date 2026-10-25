import pytest

from app.domain.errors import DomainError
from app.domain.intervals import Interval, validate_segments


def test_adjacent_segments_allowed() -> None:
    total = validate_segments(
        [Interval(0, 1000), Interval(1000, 2000)], duration_ms=5000
    )
    assert total == 2000


def test_unsorted_segments_are_normalized() -> None:
    total = validate_segments(
        [Interval(2000, 3000), Interval(0, 1000)], duration_ms=5000
    )
    assert total == 2000


@pytest.mark.parametrize(
    "segments",
    [
        [Interval(0, 1500), Interval(1000, 2000)],
        [Interval(0, 3000), Interval(1000, 2000)],
        [Interval(0, 2000), Interval(0, 2000)],
    ],
)
def test_overlaps_rejected(segments: list[Interval]) -> None:
    with pytest.raises(DomainError) as error:
        validate_segments(segments, duration_ms=5000)
    assert error.value.code == "OVERLAP"


@pytest.mark.parametrize(
    "segment",
    [Interval(1000, 1000), Interval(-1, 1000), Interval(2000, 1000)],
)
def test_invalid_ranges_rejected(segment: Interval) -> None:
    with pytest.raises(DomainError) as error:
        validate_segments([segment], duration_ms=5000)
    assert error.value.code == "INVALID_RANGE"


def test_out_of_bounds_rejected() -> None:
    with pytest.raises(DomainError) as error:
        validate_segments([Interval(4000, 5001)], duration_ms=5000)
    assert error.value.code == "OUT_OF_BOUNDS"


def test_end_at_duration_allowed() -> None:
    assert validate_segments([Interval(4000, 5000)], duration_ms=5000) == 1000


def test_empty_list_allowed() -> None:
    assert validate_segments([], duration_ms=5000) == 0
