"""Recurring transactions: compute occurrences, materialize planned rows, confirm them."""
from __future__ import annotations

from datetime import date, timedelta

from server.models import Recurrence, Transaction
from server.services.dates import add_months, clamp_day, parse
from server.storage.base import Repository

HORIZON_MONTHS = 12


def occurrences(rec: Recurrence, until: date) -> list[date]:
    if not rec.active:
        return []
    start = parse(rec.start_date)
    end = min(until, parse(rec.end_date)) if rec.end_date else until
    out: list[date] = []
    if rec.frequency == "weekly":
        d = start + timedelta(days=(rec.day - start.weekday()) % 7)
        while d <= end:
            out.append(d)
            d += timedelta(days=7)
    elif rec.frequency == "yearly":
        d = clamp_day(start.year, start.month, rec.day)
        if d < start:
            d = clamp_day(start.year + 1, start.month, rec.day)
        while d <= end:
            out.append(d)
            d = clamp_day(d.year + 1, start.month, rec.day)
    else:
        ref = date(start.year, start.month, 1)
        d = clamp_day(ref.year, ref.month, rec.day)
        if d < start:
            ref = add_months(ref, 1)
            d = clamp_day(ref.year, ref.month, rec.day)
        while d <= end:
            out.append(d)
            ref = add_months(ref, 1)
            d = clamp_day(ref.year, ref.month, rec.day)
    return out


def _row(rec: Recurrence, d: date, amount: int | None = None, status: str = "planned") -> Transaction:
    return Transaction(date=d.isoformat(), amount=amount or rec.amount, kind=rec.kind,
                       category_id=rec.category_id, account_id=rec.account_id, card_id=rec.card_id,
                       to_account_id=rec.to_account_id, goal_id=rec.goal_id,
                       description=rec.description, recurrence_id=rec.id, status=status)


def materialize(repo: Repository, today: date, rec_id: str | None = None) -> int:
    until = add_months(today, HORIZON_MONTHS)
    existing = {(t.recurrence_id, t.date) for t in repo.list("transactions") if t.recurrence_id}
    new: list[Transaction] = []
    for rec in repo.list("recurrences"):
        if rec_id and rec.id != rec_id:
            continue
        for d in occurrences(rec, until):
            if (rec.id, d.isoformat()) not in existing:
                new.append(_row(rec, d))
    if new:
        repo.add_many("transactions", new)
    return len(new)


def confirm(repo: Repository, rec_id: str, d: date, amount: int) -> Transaction:
    rec = repo.get("recurrences", rec_id)
    if rec is None:
        raise KeyError(rec_id)
    for t in repo.list("transactions"):
        if t.recurrence_id == rec_id and t.date == d.isoformat():
            return repo.update("transactions", t.id, {"status": "settled", "amount": amount})
    return repo.add("transactions", _row(rec, d, amount, "settled"))


def remove_planned(repo: Repository, rec_id: str) -> int:
    ids = [t.id for t in repo.list("transactions") if t.recurrence_id == rec_id and t.status == "planned"]
    return repo.delete_many("transactions", ids)
