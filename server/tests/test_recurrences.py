from datetime import date

from server.models import Account, Recurrence
from server.services.recurrences import confirm, materialize, occurrences
from server.storage.json_repo import JsonRepository


def rec(**kw):
    base = dict(description="Aluguel", amount=100000, kind="expense", account_id="a1",
                frequency="monthly", day=31, start_date="2026-01-31")
    base.update(kw)
    return Recurrence(**base)


def test_monthly_from_jan_31_clamps_feb():
    occ = occurrences(rec(), until=date(2026, 3, 31))
    assert occ == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)]


def test_end_date_respected_and_inactive_empty():
    assert occurrences(rec(end_date="2026-02-15"), until=date(2026, 12, 31)) == [date(2026, 1, 31)]
    assert occurrences(rec(active=False), until=date(2026, 12, 31)) == []


def test_yearly_and_weekly():
    y = rec(frequency="yearly", day=20, start_date="2026-01-20")
    assert occurrences(y, until=date(2028, 1, 1)) == [date(2026, 1, 20), date(2027, 1, 20)]
    w = rec(frequency="weekly", day=0, start_date="2026-10-05")  # Monday
    assert occurrences(w, until=date(2026, 10, 20)) == [date(2026, 10, 5), date(2026, 10, 12), date(2026, 10, 19)]


def repo_with_rec(tmp_path):
    repo = JsonRepository(tmp_path / "f.json", tmp_path / "b")
    acc = repo.add("accounts", Account(name="A"))
    r = repo.add("recurrences", rec(account_id=acc.id, start_date="2026-09-10", day=10))
    return repo, r


def test_materialize_idempotent(tmp_path):
    repo, r = repo_with_rec(tmp_path)
    today = date(2026, 10, 30)
    n1 = materialize(repo, today)
    n2 = materialize(repo, today)
    txs = [t for t in repo.list("transactions") if t.recurrence_id == r.id]
    assert n1 == len(txs) and n2 == 0
    assert min(t.date for t in txs) == "2026-09-10"
    assert max(t.date for t in txs) == "2027-10-10"
    assert all(t.status == "planned" for t in txs)


def test_confirm_sets_amount_and_settled(tmp_path):
    repo, r = repo_with_rec(tmp_path)
    materialize(repo, date(2026, 10, 30))
    t = confirm(repo, r.id, date(2026, 10, 10), 98000)
    assert t.status == "settled" and t.amount == 98000 and t.recurrence_id == r.id
    same = [x for x in repo.list("transactions") if x.recurrence_id == r.id and x.date == "2026-10-10"]
    assert len(same) == 1


def test_recurrence_api_materializes_and_confirms(client):
    acc = client.post("/api/accounts", json={"name": "A"}).json()
    r = client.post("/api/recurrences", json={"description": "Internet", "amount": 11990,
                                              "account_id": acc["id"], "day": 15,
                                              "start_date": "2026-10-15"})
    assert r.status_code == 201, r.text
    txs = client.get("/api/transactions", params={"status": "planned", "page_size": 100}).json()
    assert txs["total"] >= 12
    r = client.post(f"/api/recurrences/{r.json()['id']}/confirm", json={"date": "2026-10-15", "amount": 12990})
    assert r.status_code == 200 and r.json()["status"] == "settled"
    r = client.delete(f"/api/recurrences/{r.json()['recurrence_id']}")
    assert r.status_code == 204
    left = client.get("/api/transactions", params={"page_size": 100}).json()
    assert left["total"] == 1 and left["items"][0]["status"] == "settled"
