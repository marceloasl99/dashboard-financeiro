import json


def test_csv_has_bom_and_semicolon(demo_client):
    r = demo_client.get("/api/export.csv")
    assert r.status_code == 200
    assert r.content.startswith(b"\xef\xbb\xbf")
    text = r.content.decode("utf-8-sig")
    header = text.splitlines()[0]
    assert header.split(";")[:4] == ["Data", "Tipo", "Categoria", "Descrição"]
    assert ";" in text.splitlines()[1]
    assert "," in text.splitlines()[1].split(";")[-3]  # valor como 1234,56


def test_export_json_snapshot(demo_client):
    r = demo_client.get("/api/export.json")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 1 and len(body["transactions"]) > 100


def test_restore_roundtrip(client, demo_client):
    snap = demo_client.get("/api/export.json").json()
    assert client.get("/api/accounts").json() == []
    r = client.post("/api/import/backup", files={"file": ("finance.json", json.dumps(snap), "application/json")})
    assert r.status_code == 200, r.text
    assert len(client.get("/api/accounts").json()) == 3
    r = client.post("/api/import/backup", files={"file": ("x.json", b"{not json", "application/json")})
    assert r.status_code == 400
