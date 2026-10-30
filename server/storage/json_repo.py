from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

from server.models import COLLECTIONS, Database, Entity, Settings, default_categories, now_iso
from server.storage.base import Repository


class JsonRepository(Repository):
    """Single JSON file held in memory, written atomically on every change."""

    def __init__(self, path: Path, backups_dir: Path, keep_days: int = 30):
        self.path = Path(path)
        self.backups_dir = Path(backups_dir)
        self.keep_days = keep_days
        self._lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self._db = Database.model_validate(json.loads(self.path.read_text(encoding="utf-8")))
            self.backup_today()
        else:
            self._db = Database(categories=default_categories())
            self._write()

    # -- internals ---------------------------------------------------------
    def _coll(self, kind: str) -> list[Entity]:
        if kind not in COLLECTIONS:
            raise KeyError(f"unknown collection {kind}")
        return getattr(self._db, kind)

    def _write(self) -> None:
        payload = json.dumps(self._db.model_dump(by_alias=True), ensure_ascii=False, indent=1)
        fd, tmp = tempfile.mkstemp(prefix=self.path.name + ".", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(payload)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        self.backup_today()

    def backup_today(self, suffix: str = "") -> Path | None:
        if not self.path.exists():
            return None
        today = date.today()
        target = self.backups_dir / f"finance-{today.isoformat()}{suffix}.json"
        if suffix and target.exists():  # explicit backups (pre-restore) are never skipped or overwritten
            stamp = datetime.now().strftime("%H%M%S%f")
            target = self.backups_dir / f"finance-{today.isoformat()}{suffix}-{stamp}.json"
        if target.exists():
            return target
        shutil.copyfile(self.path, target)
        cutoff = today - timedelta(days=self.keep_days)
        for old in self.backups_dir.glob("finance-*.json"):
            stamp = old.name[len("finance-"):len("finance-") + 10]
            try:
                if date.fromisoformat(stamp) < cutoff:
                    old.unlink()
            except ValueError:
                continue
        return target

    # -- Repository --------------------------------------------------------
    def list(self, kind: str) -> list[Entity]:
        with self._lock:
            return list(self._coll(kind))

    def get(self, kind: str, id: str) -> Entity | None:
        with self._lock:
            return next((x for x in self._coll(kind) if x.id == id), None)

    def add(self, kind: str, item: Entity) -> Entity:
        return self.add_many(kind, [item])[0]

    def add_many(self, kind: str, items: list[Entity]) -> list[Entity]:
        with self._lock:
            coll = self._coll(kind)
            model = COLLECTIONS[kind]
            out = []
            for item in items:
                if not isinstance(item, model):
                    item = model.model_validate(item.model_dump(by_alias=True))
                coll.append(item)
                out.append(item)
            self._write()
            return out

    def update(self, kind: str, id: str, data: dict) -> Entity:
        with self._lock:
            coll = self._coll(kind)
            for i, cur in enumerate(coll):
                if cur.id == id:
                    merged = cur.model_dump(by_alias=True)
                    merged.update({k: v for k, v in data.items() if k not in ("id", "created_at")})
                    merged["updated_at"] = now_iso()
                    new = COLLECTIONS[kind].model_validate(merged)
                    coll[i] = new
                    self._write()
                    return new
            raise KeyError(id)

    def delete(self, kind: str, id: str) -> None:
        if self.delete_many(kind, [id]) == 0:
            raise KeyError(id)

    def delete_many(self, kind: str, ids: list[str]) -> int:
        with self._lock:
            coll = self._coll(kind)
            wanted = set(ids)
            before = len(coll)
            coll[:] = [x for x in coll if x.id not in wanted]
            removed = before - len(coll)
            if removed:
                self._write()
            return removed

    def settings(self) -> Settings:
        with self._lock:
            return self._db.settings.model_copy()

    def save_settings(self, settings: Settings) -> Settings:
        with self._lock:
            self._db.settings = settings
            self._write()
            return settings

    def replace_all(self, db: Database) -> None:
        with self._lock:
            self._db = db
            self._write()

    def snapshot(self) -> Database:
        with self._lock:
            return self._db.model_copy(deep=True)
