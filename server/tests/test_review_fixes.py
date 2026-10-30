"""Tests pinned from the final branch review (one per Important finding)."""
import json
import threading
from datetime import date

from server.importers.base import parse_amount_br
from server.models import Account, Database, Recurrence, Transaction
from server.services.recurrences import materialize
from server.storage.json_repo import JsonRepository


def test_i1_single_dot_three_digits_is_thousands():
    assert parse_amount_br("1.500") == 150000
    assert parse_amount_br("R$ 1.500") == 150000
    assert parse_amount_br("1.5") == 150
    assert parse_amount_br("1.50") == 150
    assert parse_amount_br("12.345") == 1234500


def test_i2_concurrent_writers_never_truncate(tmp_path):
    repo = JsonRepository(tmp_path / "f.json", tmp_path / "b")
    errors = []

    def writer(n):
        try:
            for i in range(15):
                repo.add("accounts", Account(name=f"w{n}-{i}"))
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=writer, args=(n,)) for n in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert not list(tmp_path.glob("*.tmp*"))
    data = json.loads((tmp_path / "f.json").read_text(encoding="utf-8"))
    assert len(Database.model_validate(data).accounts) == 60


def test_i2_demo_script_refuses_existing_file(tmp_path):
    import subprocess
    import sys
    out = tmp_path / "finance.json"
    out.write_text("{}", encoding="utf-8")
    r = subprocess.run([sys.executable, "scripts/demo_data.py", "--out", str(out)], capture_output=True, text=True)
    assert r.returncode != 0 and "--force" in (r.stderr + r.stdout)
    assert out.read_text(encoding="utf-8") == "{}"


def test_i3_installment_suffix_not_duplicated(client):
    card = client.post("/api/cards", json={"name": "Visa", "closing_day": 25, "due_day": 5}).json()
    cat = client.get("/api/categories").json()[0]
    items = client.post("/api/transactions/installments", json={
        "date": "2026-10-10", "amount": 30000, "kind": "expense", "card_id": card["id"],
        "category_id": cat["id"], "description": "TV", "total": 3}).json()
    r = client.put(f"/api/transactions/{items[2]['id']}", json={"description": "TV (3/3)"})
    assert r.json()["description"] == "TV (3/3)"
    r = client.put(f"/api/transactions/{items[0]['id']}?scope=remaining", json={"description": "TV Samsung (1/3)"})
    assert r.json()["description"] == "TV Samsung (1/3)"
    descs = sorted(t["description"] for t in client.get("/api/transactions").json()["items"])
    assert descs == ["TV Samsung (1/3)", "TV Samsung (2/3)", "TV Samsung (3/3)"]


def test_i4_deleted_or_moved_occurrence_stays_gone(client):
    acc = client.post("/api/accounts", json={"name": "A"}).json()
    rec = client.post("/api/recurrences", json={"description": "Academia", "amount": 10000,
                                                "account_id": acc["id"], "day": 8, "start_date": "2026-11-08"}).json()
    rows = client.get("/api/transactions", params={"status": "planned", "page_size": 100}).json()["items"]
    july = next(t for t in rows if t["date"] == "2027-07-08")
    aug = next(t for t in rows if t["date"] == "2027-08-08")
    assert client.delete(f"/api/transactions/{july['id']}").status_code == 204
    assert client.put(f"/api/transactions/{aug['id']}", json={"date": "2027-08-09"}).status_code == 200
    # a restart re-materializes
    materialize(client.app.state.repo, date(2026, 10, 30))
    rows = client.get("/api/transactions", params={"page_size": 100}).json()["items"]
    assert not any(t["date"] == "2027-07-08" for t in rows)
    assert len([t for t in rows if t["date"].startswith("2027-08")]) == 1
    assert client.get(f"/api/recurrences").json()[0]["skipped_dates"] == ["2027-07-08"]


def test_i5_account_used_by_recurrence_cannot_be_deleted(client):
    acc = client.post("/api/accounts", json={"name": "A"}).json()
    client.post("/api/recurrences", json={"description": "x", "amount": 100, "account_id": acc["id"],
                                          "day": 1, "start_date": "2099-01-01"})
    assert client.delete(f"/api/accounts/{acc['id']}").status_code == 409


def test_i6_two_restores_same_day_keep_two_backups(client, demo_client, tmp_path):
    snap = demo_client.get("/api/export.json").json()
    f = lambda: {"file": ("finance.json", json.dumps(snap), "application/json")}  # noqa: E731
    assert client.post("/api/import/backup", files=f()).status_code == 200
    assert client.post("/api/import/backup", files=f()).status_code == 200
    pre = list((client.app.state.data_dir / "backups").glob("*pre-restore*"))
    assert len(pre) == 2
