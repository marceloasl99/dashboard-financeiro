"""Daily balance projection: settled balance + planned account movements + unpaid statements."""
from __future__ import annotations

from datetime import date, timedelta

from server.services.balances import total_balance
from server.services.statements import build_statements
from server.storage.base import Repository


def events(repo: Repository, today: date, until: date) -> dict[str, int]:
    """Signed cash movements per day, from today (exclusive) to `until`."""
    txs = repo.list("transactions")
    active = {a.id for a in repo.list("accounts") if not a.archived and a.type != "fgts"}
    out: dict[str, int] = {}

    def add(d: str, v: int):
        out[d] = out.get(d, 0) + v

    for t in txs:
        if t.status != "planned" or not (today.isoformat() < t.date <= until.isoformat()):
            continue
        if t.kind == "income" and t.account_id in active:
            add(t.date, t.amount)
        elif t.kind == "expense" and t.account_id in active:
            add(t.date, -t.amount)
        elif t.kind == "transfer":
            if t.account_id in active and t.to_account_id not in active:
                add(t.date, -t.amount)
            if t.to_account_id in active and t.account_id not in active:
                add(t.date, t.amount)
    for card in repo.list("cards"):
        if card.archived:
            continue
        for s in build_statements(card, txs, txs, today):
            if s.status == "paid":
                continue
            due = max(s.due_date, today + timedelta(days=1))
            if due <= until and s.total - s.paid > 0:
                add(due.isoformat(), -(s.total - s.paid))
    return out


def build(repo: Repository, today: date, days: int = 90) -> dict:
    until = today + timedelta(days=days)
    bal = total_balance([a for a in repo.list("accounts") if a.type != "fgts"], repo.list("transactions"))
    ev = events(repo, today, until)
    series = [{"date": today.isoformat(), "balance": bal}]
    first_negative = None
    d = today
    while d < until:
        d += timedelta(days=1)
        bal += ev.get(d.isoformat(), 0)
        series.append({"date": d.isoformat(), "balance": bal})
        if bal < 0 and first_negative is None:
            first_negative = d.isoformat()
    low = min(series, key=lambda p: p["balance"])
    return {"series": series, "first_negative_date": first_negative,
            "lowest": low, "events": ev}
