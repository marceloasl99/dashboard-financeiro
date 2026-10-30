from __future__ import annotations

from abc import ABC, abstractmethod

from server.models import Database, Entity, Settings


class Repository(ABC):
    """Persistence boundary. `kind` is a collection name from models.COLLECTIONS."""

    @abstractmethod
    def list(self, kind: str) -> list[Entity]: ...

    @abstractmethod
    def get(self, kind: str, id: str) -> Entity | None: ...

    @abstractmethod
    def add(self, kind: str, item: Entity) -> Entity: ...

    @abstractmethod
    def add_many(self, kind: str, items: list[Entity]) -> list[Entity]: ...

    @abstractmethod
    def update(self, kind: str, id: str, data: dict) -> Entity: ...

    @abstractmethod
    def delete(self, kind: str, id: str) -> None: ...

    @abstractmethod
    def delete_many(self, kind: str, ids: list[str]) -> int: ...

    @abstractmethod
    def settings(self) -> Settings: ...

    @abstractmethod
    def save_settings(self, settings: Settings) -> Settings: ...

    @abstractmethod
    def replace_all(self, db: Database) -> None: ...

    @abstractmethod
    def snapshot(self) -> Database: ...
