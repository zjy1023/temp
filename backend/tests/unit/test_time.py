from datetime import UTC, date, datetime

from app.domain.time import business_day_bounds


def test_business_day_bounds_asia_shanghai() -> None:
    start, end = business_day_bounds(
        date(2026, 10, 23), date(2026, 10, 23), "Asia/Shanghai"
    )
    assert start == datetime(2026, 10, 22, 16, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 23, 16, 0, tzinfo=UTC)


def test_business_day_range_spans_days() -> None:
    start, end = business_day_bounds(
        date(2026, 10, 23), date(2026, 10, 24), "Asia/Shanghai"
    )
    assert (end - start).total_seconds() == 2 * 24 * 3600
