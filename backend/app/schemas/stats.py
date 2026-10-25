from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class StatsDay(BaseModel):
    date: date
    total_duration_ms: int
    task_count: int
    annotator_count: int


class StatsOut(BaseModel):
    timezone: str
    from_: date = Field(serialization_alias="from")
    to: date
    days: list[StatsDay]
