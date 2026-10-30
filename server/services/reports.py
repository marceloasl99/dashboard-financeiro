"""Annual, year-over-year and per-category reports (settled expenses by purchase month)."""
from __future__ import annotations

from datetime import date

from server.services.dashboard import change
from server.services.dates import add_months, month_key
from server.storage.base import Repository


def _rows(repo: Repository, year: int):
    return [t for t in repo.list("transactions") if t.status == "settled" and t.date[:4] == str(year)]


def annual(repo: Repository, year: int) -> dict:
    cats = {c.id: c for c in repo.list("categories")}
    per: dict[str, list[int]] = {}
    totals = {"income": 0, "expense": 0}
    monthly = [{"income": 0, "expense": 0} for _ in range(12)]
    for t in _rows(repo, year):
        if t.kind == "transfer":
            continue
        m = int(t.date[5:7]) - 1
        totals[t.kind] += t.amount
        monthly[m][t.kind] += t.amount
        key = t.category_id or ""
        per.setdefault(key, [0] * 12)[m] += t.amount
    rows = []
    for key, months in per.items():
        c = cats.get(key)
        rows.append({"category_id": key or None, "name": c.name if c else "Sem categoria",
                     "kind": c.kind if c else "expense", "color": c.color if c else "#A5B9BD",
                     "months": months, "total": sum(months),
                     "average": round(sum(months) / max(1, len([m for m in months if m]))) })
    rows.sort(key=lambda r: (r["kind"] != "expense", -r["total"]))
    return {"year": year, "categories": rows, "monthly": monthly,
            "totals": {**totals, "balance": totals["income"] - totals["expense"]}}


def compare(repo: Repository, year_a: int, year_b: int) -> dict:
    a, b = annual(repo, year_a), annual(repo, year_b)
    ta = {r["category_id"]: r for r in a["categories"]}
    tb = {r["category_id"]: r for r in b["categories"]}
    rows = []
    for key in set(ta) | set(tb):
        ra, rb = ta.get(key), tb.get(key)
        ref = ra or rb
        va, vb = (ra["total"] if ra else 0), (rb["total"] if rb else 0)
        rows.append({"category_id": key, "name": ref["name"], "kind": ref["kind"], "color": ref["color"],
                     "a": va, "b": vb, "change": change(vb, va)})
    rows.sort(key=lambda r: (r["kind"] != "expense", -abs(r["b"] - r["a"])))
    return {"year_a": year_a, "year_b": year_b, "categories": rows,
            "totals": {"a": a["totals"], "b": b["totals"]}}


def category_series(repo: Repository, category_id: str, months: int = 24, today: date | None = None) -> dict:
    today = today or date.today()
    first = add_months(date(today.year, today.month, 1), -(months - 1))
    keys = [month_key(add_months(first, i)) for i in range(months)]
    acc = {k: 0 for k in keys}
    for t in repo.list("transactions"):
        if t.status == "settled" and t.category_id == category_id and t.date[:7] in acc:
            acc[t.date[:7]] += t.amount
    series = [{"month": k, "amount": acc[k]} for k in keys]
    vals = [p["amount"] for p in series]
    return {"category_id": category_id, "series": series,
            "average": round(sum(vals) / max(1, len([v for v in vals if v]))),
            "max": max(vals) if vals else 0}
