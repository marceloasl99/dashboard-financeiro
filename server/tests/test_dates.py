from datetime import date

from server.services.dates import add_months, clamp_day, month_key, parse


def test_clamp_day_february():
    assert clamp_day(2026, 2, 31) == date(2026, 2, 28)
    assert clamp_day(2028, 2, 31) == date(2028, 2, 29)
    assert clamp_day(2026, 4, 31) == date(2026, 4, 30)


def test_add_months_clamps_and_wraps_year():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)
    assert add_months(date(2026, 3, 10), -3) == date(2025, 12, 10)


def test_month_key_and_parse():
    assert month_key(date(2026, 3, 5)) == "2026-03"
    assert parse("2026-03-05") == date(2026, 3, 5)
