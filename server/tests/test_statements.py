from datetime import date

from server.models import Card, Transaction
from server.services.statements import build_statements, statement_for, statement_period


def card(closing=25, due=5):
    return Card(id="c1", name="Visa", closing_day=closing, due_day=due)


def tx(d, amount, kind="expense", card_id="c1", **kw):
    return Transaction(date=d, amount=amount, kind=kind, card_id=card_id, **kw)


def test_closing_25_purchase_26_goes_next_month():
    c = card(25, 5)
    assert statement_for(c, date(2026, 10, 25)) == "2026-11"
    assert statement_for(c, date(2026, 10, 26)) == "2026-12"


def test_closing_31_in_february_clamps():
    c = card(31, 10)
    assert statement_for(c, date(2026, 2, 28)) == "2026-03"
    assert statement_for(c, date(2026, 3, 1)) == "2026-04"
    start, end = statement_period(c, "2026-03")
    assert (start, end) == (date(2026, 2, 1), date(2026, 2, 28))


def test_period_bounds_closing_25():
    start, end = statement_period(card(25, 5), "2026-12")
    assert (start, end) == (date(2026, 10, 26), date(2026, 11, 25))


def test_status_transitions():
    c = card(25, 5)
    txs = [tx("2026-10-20", 1000), tx("2026-11-02", 500)]
    sts = build_statements(c, txs, payments=[], today=date(2026, 10, 30))
    by = {s.period: s for s in sts}
    assert by["2026-11"].total == 1000 and by["2026-11"].status == "closed"
    assert by["2026-11"].due_date == date(2026, 11, 5)
    assert by["2026-12"].total == 500 and by["2026-12"].status == "open"


def test_paid_when_payment_covers_total():
    c = card(25, 5)
    txs = [tx("2026-10-20", 1000)]
    pay = [Transaction(date="2026-11-05", amount=1000, kind="transfer", account_id="a1",
                       to_card_id="c1", tags=["statement:2026-11"])]
    sts = build_statements(c, txs, payments=pay, today=date(2026, 11, 10))
    s = next(s for s in sts if s.period == "2026-11")
    assert s.status == "paid" and s.paid == 1000


def test_pay_endpoint_creates_transfer_and_marks_paid(client):
    acc = client.post("/api/accounts", json={"name": "Corrente"}).json()
    c = client.post("/api/cards", json={"name": "Visa", "closing_day": 25, "due_day": 5}).json()
    cat = client.get("/api/categories").json()[0]
    client.post("/api/transactions", json={"date": "2026-10-20", "amount": 7000, "kind": "expense",
                                           "category_id": cat["id"], "card_id": c["id"]})
    r = client.get(f"/api/cards/{c['id']}/statements", params={"from": "2026-11", "to": "2026-11"})
    assert r.status_code == 200, r.text
    st = r.json()[0]
    assert st["period"] == "2026-11" and st["total"] == 7000 and st["status"] != "paid"
    r = client.post(f"/api/cards/{c['id']}/statements/2026-11/pay",
                    json={"account_id": acc["id"], "amount": 7000, "date": "2026-11-05"})
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "transfer" and r.json()["to_card_id"] == c["id"]
    st = client.get(f"/api/cards/{c['id']}/statements", params={"from": "2026-11", "to": "2026-11"}).json()[0]
    assert st["status"] == "paid"
