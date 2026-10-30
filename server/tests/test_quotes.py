import json

import httpx

from server.services.quotes import fetch_quotes


def mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_quotes_brapi_and_coingecko():
    def handler(req: httpx.Request):
        if "brapi.dev" in req.url.host:
            assert req.url.params["token"] == "KEY"
            return httpx.Response(200, json={"results": [{"symbol": "BOVA11", "regularMarketPrice": 112.34}]})
        return httpx.Response(200, json={"bitcoin": {"brl": 355000.5}})
    prices = fetch_quotes(["BOVA11"], ["bitcoin"], "KEY", mock_client(handler))
    assert prices == {"BOVA11": 11234, "bitcoin": 35500050}


def test_fetch_quotes_isolates_failures():
    def handler(req: httpx.Request):
        if "brapi.dev" in req.url.host:
            return httpx.Response(500)
        return httpx.Response(200, json={"bitcoin": {"brl": 100}})
    prices = fetch_quotes(["BOVA11"], ["bitcoin"], None, mock_client(handler))
    assert prices == {"bitcoin": 10000}


def test_refresh_disabled_409(demo_client):
    r = demo_client.post("/api/quotes/refresh")
    assert r.status_code == 409


def test_refresh_updates_value(demo_client, monkeypatch):
    import server.routers.quotes as mod

    monkeypatch.setattr(mod, "fetch_quotes", lambda tickers, crypto, key, client=None: {"BOVA11": 10000})
    demo_client.put("/api/settings", json={"quotes_enabled": True})
    r = demo_client.post("/api/quotes/refresh")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "BOVA11" in body["updated"] and "IVVB11" in body["failed"]
    inv = next(i for i in demo_client.get("/api/investments").json() if i["ticker"] == "BOVA11")
    assert inv["current_value"] == round(inv["quantity"] * 10000)
