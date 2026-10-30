"""Credit card statements, computed on the fly from transactions.

A statement closes on `closing_day` and is due on the first `due_day` strictly
after the closing date. Statements are named by the month of their due date.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel

from server.models import Card, Transaction
from server.services.dates import add_months, clamp_day, month_key, parse


class Statement(BaseModel):
    card_id: str
    period: str
    start: date
    end: date
    due_date: date
    total: int
    paid: int
    status: Literal["open", "closed", "paid"]
    transactions: list[Transaction]


def closing_in(card: Card, year: int, month: int) -> date:
    return clamp_day(year, month, card.closing_day)


def due_after(card: Card, closing: date) -> date:
    candidate = clamp_day(closing.year, closing.month, card.due_day)
    if candidate <= closing:
        nxt = add_months(date(closing.year, closing.month, 1), 1)
        candidate = clamp_day(nxt.year, nxt.month, card.due_day)
    return candidate


def closing_for(card: Card, d: date) -> date:
    closing = closing_in(card, d.year, d.month)
    if d > closing:
        nxt = add_months(date(d.year, d.month, 1), 1)
        closing = closing_in(card, nxt.year, nxt.month)
    return closing


def statement_for(card: Card, transaction_date: date) -> str:
    return month_key(due_after(card, closing_for(card, transaction_date)))


def statement_period(card: Card, due_month: str) -> tuple[date, date]:
    year, month = int(due_month[:4]), int(due_month[5:7])
    first = date(year, month, 1)
    for offset in (0, -1, -2):
        ref = add_months(first, offset)
        closing = closing_in(card, ref.year, ref.month)
        if month_key(due_after(card, closing)) == due_month:
            prev = add_months(ref, -1)
            start = closing_in(card, prev.year, prev.month) + timedelta(days=1)
            return start, closing
    raise ValueError(f"no statement closes for {due_month}")


def payment_period(tx: Transaction) -> str | None:
    for t in tx.tags:
        if t.startswith("statement:"):
            return t.split(":", 1)[1]
    return None


def build_statements(card: Card, transactions: list[Transaction], payments: list[Transaction],
                     today: date) -> list[Statement]:
    groups: dict[str, list[Transaction]] = {}
    for t in transactions:
        if t.card_id != card.id or t.kind == "transfer":
            continue
        groups.setdefault(statement_for(card, parse(t.date)), []).append(t)
    paid: dict[str, int] = {}
    for p in payments:
        if p.kind == "transfer" and p.to_card_id == card.id and (period := payment_period(p)):
            paid[period] = paid.get(period, 0) + p.amount
    out: list[Statement] = []
    for period in sorted(set(groups) | set(paid)):
        txs = sorted(groups.get(period, []), key=lambda t: t.date)
        start, end = statement_period(card, period)
        total = sum(t.amount if t.kind == "expense" else -t.amount for t in txs)
        p = paid.get(period, 0)
        if today <= end:
            status: Literal["open", "closed", "paid"] = "open"
        elif total > 0 and p >= total:
            status = "paid"
        else:
            status = "closed"
        out.append(Statement(card_id=card.id, period=period, start=start, end=end,
                             due_date=due_after(card, end), total=total, paid=p,
                             status=status, transactions=txs))
    return out
