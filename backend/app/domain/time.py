from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def business_day_bounds(
    from_date: date, to_date: date, timezone_name: str
) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone_name)
    start = datetime.combine(from_date, time.min, tzinfo=zone).astimezone(
        UTC
    )
    end = datetime.combine(
        to_date + timedelta(days=1), time.min, tzinfo=zone
    ).astimezone(UTC)
    return start, end
