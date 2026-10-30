"""Month events: card closings/dues, planned transactions, goals, investment maturities."""
from __future__ import annotations

from datetime import date

from server.services.dates import month_bounds
from server.services.statements import build_statements, closing_in, due_after
from server.storage.base import Repository


def build(repo: Repository, year: int, month: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    start, end = month_bounds(year, month)
    s, e = start.isoformat(), end.isoformat()
    txs = repo.list("transactions")
    cats = {c.id: c for c in repo.list("categories")}
    out: list[dict] = []

    for card in repo.list("cards"):
        if card.archived:
            continue
        closing = closing_in(card, year, month)
        out.append({"date": closing.isoformat(), "type": "card_closing", "title": f"Fecha {card.name}",
                    "amount": None, "ref_id": card.id, "color": card.color})
        sts = {st.due_date.isoformat(): st for st in build_statements(card, txs, txs, today)}
        due = due_after(card, closing)
        for d_iso, st in sts.items():
            if s <= d_iso <= e:
                out.append({"date": d_iso, "type": "card_due", "title": f"Vence {card.name}",
                            "amount": st.total - st.paid, "ref_id": card.id, "color": card.color,
                            "status": st.status})
        if s <= due.isoformat() <= e and due.isoformat() not in sts:
            out.append({"date": due.isoformat(), "type": "card_due", "title": f"Vence {card.name}",
                        "amount": 0, "ref_id": card.id, "color": card.color, "status": "open"})

    for t in txs:
        if t.status == "planned" and s <= t.date <= e:
            cat = cats.get(t.category_id or "")
            out.append({"date": t.date, "type": "planned", "title": t.description or (cat.name if cat else "Previsto"),
                        "amount": t.amount if t.kind == "income" else -t.amount, "ref_id": t.id,
                        "color": cat.color if cat else "#6C7D84", "kind": t.kind,
                        "recurrence_id": t.recurrence_id})

    for g in repo.list("goals"):
        if g.deadline and s <= g.deadline <= e:
            out.append({"date": g.deadline, "type": "goal", "title": f"Prazo: {g.name}",
                        "amount": g.target, "ref_id": g.id, "color": g.color})

    for inv in repo.list("investments"):
        if inv.maturity and inv.status == "active" and s <= inv.maturity <= e:
            out.append({"date": inv.maturity, "type": "investment_maturity",
                        "title": f"Vencimento: {inv.asset}", "amount": inv.current_value,
                        "ref_id": inv.id, "color": "#9A6A1D"})

    return sorted(out, key=lambda x: (x["date"], x["type"]))
