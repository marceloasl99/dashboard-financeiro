from __future__ import annotations

import calendar
from datetime import date


def clamp_day(year: int, month: int, day: int) -> date:
    """Day of month, pulled back to the last day when the month is shorter."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def add_months(d: date, n: int) -> date:
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return clamp_day(year, month + 1, d.day)


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def parse(s: str) -> date:
    return date.fromisoformat(s)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), clamp_day(year, month, 31)
