import json
import time

import pytest

from server.models import Account, Database
from server.storage.json_repo import JsonRepository


def make_repo(tmp_path, **kw):
    return JsonRepository(tmp_path / "finance.json", tmp_path / "backups", **kw)


def test_creates_file_with_default_categories(tmp_path):
    repo = make_repo(tmp_path)
    cats = repo.list("categories")
    assert (tmp_path / "finance.json").exists()
    assert len([c for c in cats if c.kind == "expense"]) >= 14
    assert len([c for c in cats if c.kind == "income"]) >= 5


def test_add_and_get_roundtrip_after_reload(tmp_path):
    repo = make_repo(tmp_path)
    acc = repo.add("accounts", Account(name="Corrente", type="checking", initial_balance=10000))
    again = make_repo(tmp_path)
    got = again.get("accounts", acc.id)
    assert got is not None
    assert got.name == "Corrente"
    assert got.initial_balance == 10000


def test_update_bumps_updated_at(tmp_path):
    repo = make_repo(tmp_path)
    acc = repo.add("accounts", Account(name="A", type="wallet"))
    time.sleep(0.01)
    upd = repo.update("accounts", acc.id, {"name": "B"})
    assert upd.name == "B"
    assert upd.updated_at > acc.updated_at
    assert upd.created_at == acc.created_at


def test_delete_missing_raises_keyerror(tmp_path):
    repo = make_repo(tmp_path)
    with pytest.raises(KeyError):
        repo.delete("accounts", "nope")
    with pytest.raises(KeyError):
        repo.update("accounts", "nope", {"name": "x"})


def test_backup_created_once_per_day(tmp_path):
    repo = make_repo(tmp_path)
    repo.add("accounts", Account(name="A", type="wallet"))
    repo.add("accounts", Account(name="B", type="wallet"))
    backups = list((tmp_path / "backups").glob("finance-*.json"))
    assert len(backups) == 1


def test_write_is_atomic(tmp_path):
    repo = make_repo(tmp_path)
    repo.add("accounts", Account(name="A", type="wallet"))
    assert not list(tmp_path.glob("*.tmp"))
    data = json.loads((tmp_path / "finance.json").read_text(encoding="utf-8"))
    Database.model_validate(data)
    assert len(data["accounts"]) == 1


def test_replace_all_and_snapshot(tmp_path):
    repo = make_repo(tmp_path)
    db = Database()
    db.accounts.append(Account(name="X", type="savings"))
    repo.replace_all(db)
    snap = repo.snapshot()
    assert [a.name for a in snap.accounts] == ["X"]
    assert repo.settings().currency == "BRL"
