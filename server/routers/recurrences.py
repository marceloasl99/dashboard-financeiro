"""Recurrences CRUD plus materialization and confirmation of occurrences."""
from datetime import date

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from server.deps import get_repo
from server.errors import ApiError
from server.models import Recurrence, Transaction
from server.routers.crud import create_model_for
from server.services import recurrences as svc
from server.storage.base import Repository

router = APIRouter(prefix="/api/recurrences", tags=["recurrences"])
RecurrenceCreate = create_model_for(Recurrence)


class ConfirmBody(BaseModel):
    date: str
    amount: int = Field(gt=0)


def _get(repo: Repository, id: str) -> Recurrence:
    rec = repo.get("recurrences", id)
    if rec is None:
        raise ApiError(404, "Recorrência não encontrada.")
    return rec  # type: ignore[return-value]


def _validate(repo: Repository, data: dict) -> None:
    if data.get("account_id") and data.get("card_id"):
        raise ApiError(400, "Informe conta ou cartão, não os dois.", "account_id")
    if not data.get("account_id") and not data.get("card_id"):
        raise ApiError(400, "Informe a conta ou o cartão.", "account_id")


@router.get("", response_model=list[Recurrence])
def list_recurrences(repo: Repository = Depends(get_repo)):
    return repo.list("recurrences")


@router.post("", response_model=Recurrence, status_code=201)
def create(body: RecurrenceCreate, repo: Repository = Depends(get_repo)):  # type: ignore[valid-type]
    data = body.model_dump()
    _validate(repo, data)
    rec = repo.add("recurrences", Recurrence(**data))
    svc.materialize(repo, date.today(), rec.id)
    return rec


@router.put("/{id}", response_model=Recurrence)
def update(id: str, body: dict, repo: Repository = Depends(get_repo)):
    rec = _get(repo, id)
    merged = {**rec.model_dump(), **body}
    _validate(repo, merged)
    svc.remove_planned(repo, id)
    rec = repo.update("recurrences", id, body)
    svc.materialize(repo, date.today(), id)
    return rec


@router.delete("/{id}", status_code=204)
def delete(id: str, repo: Repository = Depends(get_repo)):
    _get(repo, id)
    svc.remove_planned(repo, id)
    repo.delete("recurrences", id)
    return Response(status_code=204)


@router.post("/{id}/confirm", response_model=Transaction)
def confirm(id: str, body: ConfirmBody, repo: Repository = Depends(get_repo)):
    _get(repo, id)
    return svc.confirm(repo, id, date.fromisoformat(body.date), body.amount)
