"""Refresh investment values from market quotes (only when enabled in settings)."""
from fastapi import APIRouter, Depends

from server.deps import get_repo
from server.errors import ApiError
from server.models import now_iso
from server.services.quotes import fetch_quotes
from server.storage.base import Repository

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.post("/refresh")
def refresh(repo: Repository = Depends(get_repo)):
    settings = repo.settings()
    if not settings.quotes_enabled:
        raise ApiError(409, "Cotações desativadas nas configurações.")
    invs = [i for i in repo.list("investments") if i.status == "active" and i.ticker]
    tickers = sorted({i.ticker.upper() for i in invs if i.quote_source != "coingecko"})
    crypto = sorted({i.ticker.lower() for i in invs if i.quote_source == "coingecko"})
    prices = fetch_quotes(tickers, crypto, settings.quotes_api_key or None)
    updated, failed = [], []
    for inv in invs:
        key = inv.ticker.lower() if inv.quote_source == "coingecko" else inv.ticker.upper()
        price = prices.get(key)
        if price is None:
            failed.append(inv.ticker)
            continue
        repo.update("investments", inv.id, {"current_value": round(inv.quantity * price)})
        updated.append(inv.ticker)
    return {"updated": updated, "failed": failed, "at": now_iso(),
            "notice": "Cotações aproximadas, com atraso. Use apenas como referência."}
