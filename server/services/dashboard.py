"""Aggregations for the overview screen. Card expenses count in the purchase month."""
from __future__ import annotations

from datetime import date, timedelta

from server.models import Transaction
from server.services.balances import account_balance
from server.services.dates import month_bounds
from server.services.forecast import build as build_forecast
from server.services.statements import build_statements
from server.storage.base import Repository


def in_month(txs: list[Transaction], year: int, month: int) -> list[Transaction]:
    start, end = month_bounds(year, month)
    s, e = start.isoformat(), end.isoformat()
    return [t for t in txs if s <= t.date <= e]


def totals(txs: list[Transaction], settled_only: bool = True) -> dict[str, int]:
    inc = exp = 0
    for t in txs:
        if settled_only and t.status != "settled":
            continue
        if t.kind == "income":
            inc += t.amount
        elif t.kind == "expense":
            exp += t.amount
    return {"income": inc, "expense": exp, "balance": inc - exp}


def change(cur: int, prev: int) -> float | None:
    if not prev:
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


def budget_for(budget, year: int, month: int) -> int:
    return budget.overrides.get(f"{year:04d}-{month:02d}", budget.amount)


def build(repo: Repository, year: int, month: int, today: date | None = None) -> dict:
    today = today or date.today()
    txs = repo.list("transactions")
    cur = in_month(txs, year, month)
    py, pm = (year, month - 1) if month > 1 else (year - 1, 12)
    prev = in_month(txs, py, pm)
    t_cur, t_prev = totals(cur), totals(prev)

    by_cat: dict[str, int] = {}
    for t in cur:
        if t.kind == "expense" and t.status == "settled":
            by_cat[t.category_id or ""] = by_cat.get(t.category_id or "", 0) + t.amount
    by_category = sorted(({"category_id": k or None, "amount": v} for k, v in by_cat.items()),
                         key=lambda x: -x["amount"])

    monthly = []
    for m in range(1, 13):
        tt = totals(in_month(txs, year, m))
        tt["month"] = m
        monthly.append(tt)

    accounts = [{"id": a.id, "name": a.name, "type": a.type, "color": a.color,
                 "balance": account_balance(a, txs)}
                for a in repo.list("accounts") if not a.archived]

    statements, alerts = [], []
    for card in repo.list("cards"):
        if card.archived:
            continue
        for s in build_statements(card, txs, txs, today):
            if s.status == "paid" or s.total <= 0:
                continue
            statements.append({"card_id": card.id, "card_name": card.name, "color": card.color,
                               "period": s.period, "total": s.total, "paid": s.paid,
                               "due_date": s.due_date.isoformat(), "end": s.end.isoformat(),
                               "status": s.status, "limit": card.limit})
            days = (s.due_date - today).days
            if s.status == "closed" and 0 <= days <= 7:
                alerts.append({"type": "statement_due", "level": "warning",
                               "message": f"Fatura {card.name} ({s.period}) vence em {days} dia(s): "
                                          f"R$ {(s.total - s.paid) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                               "ref_id": card.id})
            elif s.status == "closed" and days < 0:
                alerts.append({"type": "statement_overdue", "level": "danger",
                               "message": f"Fatura {card.name} ({s.period}) vencida há {-days} dia(s).",
                               "ref_id": card.id})

    cats = {c.id: c for c in repo.list("categories")}
    budgets = []
    for b in repo.list("budgets"):
        limit = budget_for(b, year, month)
        spent = by_cat.get(b.category_id, 0)
        budgets.append({"category_id": b.category_id, "limit": limit, "spent": spent})
        if limit and spent > limit:
            name = cats[b.category_id].name if b.category_id in cats else "Categoria"
            alerts.append({"type": "budget", "level": "danger", "ref_id": b.category_id,
                           "message": f"{name}: orçamento estourado ({spent * 100 // limit}% do limite)."})

    fc = build_forecast(repo, today, 90)
    if fc["first_negative_date"]:
        d = date.fromisoformat(fc["first_negative_date"])
        alerts.append({"type": "forecast", "level": "danger", "ref_id": None,
                       "message": f"Saldo projetado fica negativo em {d.strftime('%d/%m')}."})

    pending = [t for t in txs if t.status == "planned" and t.recurrence_id and t.date <= today.isoformat()]
    if pending:
        alerts.append({"type": "pending", "level": "info", "ref_id": None,
                       "message": f"{len(pending)} lançamento(s) previsto(s) aguardando confirmação."})

    inc = t_cur["income"]
    return {
        "year": year, "month": month,
        "kpis": {**t_cur,
                 "savings_rate": round(t_cur["balance"] / inc * 100, 1) if inc else 0.0,
                 "income_change": change(inc, t_prev["income"]),
                 "expense_change": change(t_cur["expense"], t_prev["expense"]),
                 "planned_expense": totals(cur, settled_only=False)["expense"] - t_cur["expense"]},
        "by_category": by_category,
        "monthly": monthly,
        "accounts": accounts,
        "statements": sorted(statements, key=lambda s: s["due_date"]),
        "budgets": budgets,
        "alerts": alerts,
        "forecast": {"first_negative_date": fc["first_negative_date"], "lowest": fc["lowest"]},
        "pending": [t.model_dump() for t in pending][:20],
    }
