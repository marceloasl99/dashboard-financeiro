import json
from datetime import date

from server.demo import build_demo


def test_demo_has_expected_shape():
    db = build_demo(today=date(2026, 10, 29))
    assert len([a for a in db.accounts if a.type != "fgts"]) == 2
    assert len([a for a in db.accounts if a.type == "fgts"]) == 1
    assert len(db.cards) == 2
    assert len(db.transactions) >= 600
    assert len(db.investments) >= 3
    assert len(db.goals) == 2
    assert len(db.recurrences) >= 8
    assert len(db.rules) == 6
    assert len(db.budgets) >= 6
    assert all(c.account_id or c.card_id for c in db.transactions if c.kind != "transfer")


def test_demo_is_deterministic():
    a = build_demo(today=date(2026, 10, 29), seed=7).model_dump_json()
    b = build_demo(today=date(2026, 10, 29), seed=7).model_dump_json()
    assert a == b


def test_demo_no_future_settled():
    today = date(2026, 10, 29)
    db = build_demo(today=today)
    assert all(t.date <= today.isoformat() for t in db.transactions if t.status == "settled")
    assert any(t.status == "planned" for t in db.transactions)


def test_demo_covers_14_months():
    db = build_demo(today=date(2026, 10, 29))
    months = {t.date[:7] for t in db.transactions if t.status == "settled"}
    assert "2025-09" in months and "2026-10" in months
