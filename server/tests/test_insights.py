from datetime import date

from server.models import Account, Card, Category, Transaction
from server.services import balances, dashboard, forecast, reports
from server.storage.json_repo import JsonRepository


def setup(tmp_path):
    repo = JsonRepository(tmp_path / "f.json", tmp_path / "b")
    a = repo.add("accounts", Account(name="A", initial_balance=100000))
    b = repo.add("accounts", Account(name="B", initial_balance=0))
    card = repo.add("cards", Card(name="C", closing_day=25, due_day=5))
    food = next(c for c in repo.list("categories") if c.name == "Alimentação")
    return repo, a, b, card, food


def test_balance_ignores_card_and_planned(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    repo.add("transactions", Transaction(date="2026-10-01", amount=10000, account_id=a.id, category_id=food.id))
    repo.add("transactions", Transaction(date="2026-10-02", amount=5000, card_id=card.id, category_id=food.id))
    repo.add("transactions", Transaction(date="2026-11-02", amount=7000, account_id=a.id, status="planned"))
    assert balances.account_balance(a, repo.list("transactions")) == 90000


def test_transfer_moves_between_accounts(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    repo.add("transactions", Transaction(date="2026-10-01", amount=30000, kind="transfer", account_id=a.id, to_account_id=b.id))
    txs = repo.list("transactions")
    assert balances.account_balance(a, txs) == 70000
    assert balances.account_balance(b, txs) == 30000


def test_forecast_first_negative_includes_statement(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    repo.update("accounts", b.id, {"archived": True})
    repo.add("accounts", Account(name="FGTS", type="fgts", initial_balance=999999))  # not liquid: ignored
    repo.add("transactions", Transaction(date="2026-10-20", amount=150000, card_id=card.id, category_id=food.id))
    f = forecast.build(repo, today=date(2026, 10, 30), days=30)
    assert f["series"][0]["balance"] == 100000
    assert f["first_negative_date"] == "2026-11-05"
    nov5 = next(p for p in f["series"] if p["date"] == "2026-11-05")
    assert nov5["balance"] == -50000


def test_dashboard_card_expense_in_purchase_month(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    repo.add("transactions", Transaction(date="2026-10-20", amount=5000, card_id=card.id, category_id=food.id))
    repo.add("transactions", Transaction(date="2026-10-05", amount=200000, kind="income", account_id=a.id))
    repo.add("transactions", Transaction(date="2026-09-05", amount=100000, kind="income", account_id=a.id))
    d = dashboard.build(repo, 2026, 10, today=date(2026, 10, 30))
    assert d["kpis"]["expense"] == 5000 and d["kpis"]["income"] == 200000
    assert d["kpis"]["income_change"] == 100.0
    assert d["by_category"][0]["amount"] == 5000
    assert d["monthly"][9]["expense"] == 5000 and len(d["monthly"]) == 12
    assert d["statements"][0]["total"] == 5000
    assert {x["id"]: x["balance"] for x in d["accounts"]}[a.id] == 400000


def test_dashboard_alerts_budget_and_due(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    from server.models import Budget
    repo.add("budgets", Budget(category_id=food.id, amount=1000))
    repo.add("transactions", Transaction(date="2026-10-20", amount=5000, card_id=card.id, category_id=food.id))
    d = dashboard.build(repo, 2026, 10, today=date(2026, 11, 1))
    kinds = {x["type"] for x in d["alerts"]}
    assert "budget" in kinds and "statement_due" in kinds


def test_annual_totals_match_transactions(tmp_path):
    repo, a, b, card, food = setup(tmp_path)
    repo.add("transactions", Transaction(date="2026-03-20", amount=5000, card_id=card.id, category_id=food.id))
    repo.add("transactions", Transaction(date="2026-07-20", amount=2500, account_id=a.id, category_id=food.id))
    repo.add("transactions", Transaction(date="2025-07-20", amount=1000, account_id=a.id, category_id=food.id))
    r = reports.annual(repo, 2026)
    row = next(x for x in r["categories"] if x["category_id"] == food.id)
    assert row["total"] == 7500 and row["months"][2] == 5000 and row["months"][6] == 2500
    assert r["totals"]["expense"] == 7500
    c = reports.compare(repo, 2025, 2026)
    row = next(x for x in c["categories"] if x["category_id"] == food.id)
    assert row["a"] == 1000 and row["b"] == 7500 and row["change"] == 650.0
    s = reports.category_series(repo, food.id, months=3, today=date(2026, 7, 31))
    assert [p["amount"] for p in s["series"]] == [0, 0, 2500]


def test_insight_endpoints(demo_client):
    assert demo_client.get("/api/dashboard", params={"year": 2026, "month": 10}).status_code == 200
    assert demo_client.get("/api/forecast", params={"days": 90}).status_code == 200
    cal = demo_client.get("/api/calendar", params={"year": 2026, "month": 11}).json()
    assert {e["type"] for e in cal} >= {"card_due", "card_closing", "planned"}
    assert demo_client.get("/api/reports/annual", params={"year": 2026}).status_code == 200
    assert demo_client.get("/api/reports/compare", params={"year_a": 2025, "year_b": 2026}).status_code == 200
    cat = demo_client.get("/api/categories").json()[0]["id"]
    assert demo_client.get(f"/api/reports/category/{cat}", params={"months": 12}).status_code == 200
