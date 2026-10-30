"""Optional market quotes: brapi.dev (B3 tickers) and CoinGecko (crypto). Approximate by nature."""
from __future__ import annotations

import httpx

BRAPI = "https://brapi.dev/api/quote/{tickers}"
COINGECKO = "https://api.coingecko.com/api/v3/simple/price"
TIMEOUT = 10.0


def fetch_quotes(tickers: list[str], crypto: list[str], api_key: str | None,
                 client: httpx.Client | None = None) -> dict[str, int]:
    """Price in BRL cents per symbol. Symbols that fail are simply absent."""
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT)
    out: dict[str, int] = {}
    try:
        if tickers:
            try:
                params = {"token": api_key} if api_key else {}
                r = client.get(BRAPI.format(tickers=",".join(tickers)), params=params, timeout=TIMEOUT)
                r.raise_for_status()
                for item in r.json().get("results", []):
                    price = item.get("regularMarketPrice")
                    if item.get("symbol") and price is not None:
                        out[item["symbol"].upper()] = round(float(price) * 100)
            except (httpx.HTTPError, ValueError, KeyError):
                pass
        if crypto:
            try:
                r = client.get(COINGECKO, params={"ids": ",".join(crypto), "vs_currencies": "brl"}, timeout=TIMEOUT)
                r.raise_for_status()
                for cid, prices in r.json().items():
                    if isinstance(prices, dict) and "brl" in prices:
                        out[cid] = round(float(prices["brl"]) * 100)
            except (httpx.HTTPError, ValueError):
                pass
    finally:
        if own:
            client.close()
    return out
