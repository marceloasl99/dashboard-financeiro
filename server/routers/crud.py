"""Generic CRUD router factory. One router per collection, same four verbs.

No `from __future__ import annotations` here: FastAPI must see the real
`Create` class in the endpoint signature, not a string.
"""
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, create_model

from server.deps import get_repo
from server.errors import ApiError
from server.models import COLLECTIONS, Entity, Settings
from server.storage.base import Repository

LINKED_MESSAGE = "Existem lançamentos vinculados; arquive em vez de excluir."

# collection -> transaction fields that reference it
REFERENCES = {
    "accounts": ("account_id", "to_account_id"),
    "cards": ("card_id", "to_card_id"),
    "categories": ("category_id",),
    "goals": ("goal_id",),
}


def create_model_for(model: type[Entity]) -> type[BaseModel]:
    """Same fields as the entity, minus id/timestamps (server-assigned)."""
    fields = {
        name: (f.annotation, f)
        for name, f in model.model_fields.items()
        if name not in ("id", "created_at", "updated_at")
    }
    created = create_model(f"{model.__name__}Create", __config__=model.model_config, **fields)
    return created


def check_unlinked(repo: Repository, kind: str, id: str) -> None:
    refs = REFERENCES.get(kind)
    if not refs:
        return
    for tx in repo.list("transactions"):
        if any(getattr(tx, r, None) == id for r in refs):
            raise ApiError(409, LINKED_MESSAGE)
    if kind == "categories":
        for rec in repo.list("recurrences"):
            if rec.category_id == id:
                raise ApiError(409, LINKED_MESSAGE)


def make_router(kind: str, model: type[Entity] | None = None) -> APIRouter:
    model = model or COLLECTIONS[kind]
    Create = create_model_for(model)
    router = APIRouter(prefix=f"/api/{kind}", tags=[kind])

    @router.get("", response_model=list[model])
    def list_items(repo: Repository = Depends(get_repo)):
        return repo.list(kind)

    @router.get("/{id}", response_model=model)
    def get_item(id: str, repo: Repository = Depends(get_repo)):
        item = repo.get(kind, id)
        if item is None:
            raise ApiError(404, "Registro não encontrado.")
        return item

    @router.post("", response_model=model, status_code=201)
    def create_item(body: Create, repo: Repository = Depends(get_repo)):  # type: ignore[valid-type]
        return repo.add(kind, model.model_validate(body.model_dump(by_alias=True)))

    @router.put("/{id}", response_model=model)
    def update_item(id: str, body: dict, repo: Repository = Depends(get_repo)):
        if repo.get(kind, id) is None:
            raise ApiError(404, "Registro não encontrado.")
        try:
            return repo.update(kind, id, body)
        except ValueError as e:  # pydantic ValidationError
            raise ApiError(400, "Dados inválidos.", _first_field(e))

    @router.delete("/{id}", status_code=204)
    def delete_item(id: str, repo: Repository = Depends(get_repo)):
        if repo.get(kind, id) is None:
            raise ApiError(404, "Registro não encontrado.")
        check_unlinked(repo, kind, id)
        repo.delete(kind, id)
        return Response(status_code=204)

    return router


def _first_field(e: Exception) -> str | None:
    errors = getattr(e, "errors", None)
    if callable(errors):
        errs = errors()
        if errs and errs[0].get("loc"):
            return str(errs[0]["loc"][0])
    return None


def settings_router() -> APIRouter:
    router = APIRouter(prefix="/api/settings", tags=["settings"])

    @router.get("", response_model=Settings)
    def get_settings(repo: Repository = Depends(get_repo)):
        return repo.settings()

    @router.put("", response_model=Settings)
    def put_settings(body: dict, repo: Repository = Depends(get_repo)):
        merged = repo.settings().model_dump()
        merged.update(body)
        return repo.save_settings(Settings.model_validate(merged))

    return router
