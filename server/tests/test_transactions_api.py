import pytest


@pytest.fixture
def setup(client):
    acc = client.post("/api/accounts", json={"name": "Corrente"}).json()
    card = client.post("/api/cards", json={"name": "Visa", "closing_day": 25, "due_day": 5}).json()
    cats = client.get("/api/categories").json()
    food = next(c for c in cats if c["name"] == "Alimentação")
    rent = next(c for c in cats if c["name"] == "Moradia")
    return {"acc": acc, "card": card, "food": food, "rent": rent}


def post(client, **kw):
    body = {"date": "2026-10-10", "amount": 1000, "kind": "expense"}
    body.update(kw)
    return client.post("/api/transactions", json=body)


def test_filter_by_period_and_text(client, setup):
    s = setup
    post(client, account_id=s["acc"]["id"], category_id=s["food"]["id"], description="Mercado", date="2026-10-03")
    post(client, account_id=s["acc"]["id"], category_id=s["food"]["id"], description="iFood", date="2026-10-20")
    post(client, account_id=s["acc"]["id"], category_id=s["rent"]["id"], description="Aluguel", date="2026-09-10")
    r = client.get("/api/transactions", params={"from": "2026-10-01", "to": "2026-10-31"})
    assert r.status_code == 200
    assert r.json()["total"] == 2
    assert [t["description"] for t in r.json()["items"]] == ["iFood", "Mercado"]  # newest first
    r = client.get("/api/transactions", params={"q": "ifood"})
    assert r.json()["total"] == 1
    r = client.get("/api/transactions", params={"category_id": s["rent"]["id"]})
    assert r.json()["total"] == 1
    r = client.get("/api/transactions", params={"page": 1, "page_size": 1})
    assert len(r.json()["items"]) == 1 and r.json()["total"] == 3


def test_both_account_and_card_rejected(client, setup):
    s = setup
    r = post(client, account_id=s["acc"]["id"], card_id=s["card"]["id"], category_id=s["food"]["id"])
    assert r.status_code == 400 and r.json()["field"] == "account_id"
    r = post(client, category_id=s["food"]["id"])
    assert r.status_code == 400
    r = post(client, kind="transfer", account_id=s["acc"]["id"])
    assert r.status_code == 400 and r.json()["field"] == "to_account_id"


def test_unknown_account_rejected(client, setup):
    r = post(client, account_id="nope", category_id=setup["food"]["id"])
    assert r.status_code == 400 and r.json()["field"] == "account_id"


def test_installments_endpoint_and_delete_remaining(client, setup):
    s = setup
    r = client.post("/api/transactions/installments", json={
        "date": "2026-10-10", "amount": 120000, "kind": "expense", "card_id": s["card"]["id"],
        "category_id": s["food"]["id"], "description": "Geladeira", "total": 12})
    assert r.status_code == 201, r.text
    items = r.json()
    assert len(items) == 12 and sum(t["amount"] for t in items) == 120000
    third = items[2]
    r = client.delete(f"/api/transactions/{third['id']}", params={"scope": "remaining"})
    assert r.status_code == 204
    left = client.get("/api/transactions", params={"page_size": 100}).json()
    assert left["total"] == 2
    r = client.put(f"/api/transactions/{items[0]['id']}", params={"scope": "remaining"},
                   json={"description": "Geladeira Brastemp"})
    assert r.status_code == 200
    left = client.get("/api/transactions", params={"page_size": 100}).json()["items"]
    assert all(t["description"].startswith("Geladeira Brastemp") for t in left)
    assert {t["installment"]["number"] for t in left} == {1, 2}


def test_installments_require_card(client, setup):
    r = client.post("/api/transactions/installments", json={
        "date": "2026-10-10", "amount": 1000, "kind": "expense", "account_id": setup["acc"]["id"],
        "category_id": setup["food"]["id"], "total": 2})
    assert r.status_code == 400 and r.json()["field"] == "card_id"
