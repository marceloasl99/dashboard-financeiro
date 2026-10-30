def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["version"] == "2.0.0-beta"


def test_serves_web_index(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Finance OS" in r.text
