def test_create_list_update_delete_account(client):
    r = client.post("/api/accounts", json={"name": "Corrente", "type": "checking", "initial_balance": 5000})
    assert r.status_code == 201, r.text
    acc = r.json()
    assert acc["id"] and acc["initial_balance"] == 5000

    r = client.get("/api/accounts")
    assert r.status_code == 200
    assert [a["name"] for a in r.json()] == ["Corrente"]

    r = client.put(f"/api/accounts/{acc['id']}", json={"name": "Nubank"})
    assert r.status_code == 200 and r.json()["name"] == "Nubank"

    r = client.delete(f"/api/accounts/{acc['id']}")
    assert r.status_code == 204
    assert client.get("/api/accounts").json() == []

    r = client.get(f"/api/accounts/{acc['id']}")
    assert r.status_code == 404 and r.json()["error"]


def test_validation_error_shape(client):
    r = client.post("/api/accounts", json={"type": "checking"})
    assert r.status_code == 400
    body = r.json()
    assert body["field"] == "name"
    assert body["error"]


def test_delete_account_with_transactions_conflict(client):
    acc = client.post("/api/accounts", json={"name": "A"}).json()
    cat = client.get("/api/categories").json()[0]
    r = client.post("/api/transactions", json={
        "date": "2026-10-01", "amount": 1000, "kind": "expense",
        "category_id": cat["id"], "account_id": acc["id"]})
    assert r.status_code == 201, r.text
    r = client.delete(f"/api/accounts/{acc['id']}")
    assert r.status_code == 409
    assert "arquive" in r.json()["error"].lower()
    r = client.delete(f"/api/categories/{cat['id']}")
    assert r.status_code == 409


def test_settings_get_put(client):
    assert client.get("/api/settings").json()["currency"] == "BRL"
    r = client.put("/api/settings", json={"theme": "dark"})
    assert r.status_code == 200 and r.json()["theme"] == "dark"
    assert client.get("/api/settings").json()["theme"] == "dark"
    assert client.get("/api/settings").json()["currency"] == "BRL"


def test_default_categories_listed(client):
    cats = client.get("/api/categories").json()
    assert any(c["name"] == "Alimentação" for c in cats)
