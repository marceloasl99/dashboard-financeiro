"""Transactions: filtered listing, validation of account/card, installments, scoped edits."""
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from server.deps import get_repo
from server.errors import ApiError
from server.models import Installment, Transaction, TransactionKind, TransactionStatus
from server.services.categorizer_stub import normalize
from server.services.installments import build_installments
from server.storage.base import Repository

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    date: str
    amount: int = Field(gt=0)
    kind: TransactionKind = "expense"
    category_id: str | None = None
    account_id: str | None = None
    card_id: str | None = None
    to_account_id: str | None = None
    to_card_id: str | None = None
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    installment: Installment | None = None
    recurrence_id: str | None = None
    import_id: str | None = None
    goal_id: str | None = None
    status: TransactionStatus = "settled"


class InstallmentsCreate(TransactionCreate):
    total: int = Field(ge=2, le=120)


def validate(repo: Repository, t: TransactionCreate) -> None:
    if t.account_id and t.card_id:
        raise ApiError(400, "Informe conta ou cartão, não os dois.", "account_id")
    if not t.account_id and not t.card_id:
        raise ApiError(400, "Informe a conta ou o cartão.", "account_id")
    if t.account_id and repo.get("accounts", t.account_id) is None:
        raise ApiError(400, "Conta não encontrada.", "account_id")
    if t.card_id and repo.get("cards", t.card_id) is None:
        raise ApiError(400, "Cartão não encontrado.", "card_id")
    if t.kind == "transfer":
        if not t.account_id:
            raise ApiError(400, "Transferência sai de uma conta.", "account_id")
        if not t.to_account_id and not t.to_card_id:
            raise ApiError(400, "Informe o destino da transferência.", "to_account_id")
    if t.category_id and repo.get("categories", t.category_id) is None:
        raise ApiError(400, "Categoria não encontrada.", "category_id")


@router.get("")
def list_transactions(repo: Repository = Depends(get_repo),
                      from_: str | None = Query(None, alias="from"), to: str | None = None,
                      account_id: str | None = None, card_id: str | None = None,
                      category_id: str | None = None, kind: str | None = None,
                      status: str | None = None, q: str | None = None,
                      page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=1000)):
    rows = repo.list("transactions")
    if from_:
        rows = [t for t in rows if t.date >= from_]
    if to:
        rows = [t for t in rows if t.date <= to]
    if account_id:
        rows = [t for t in rows if account_id in (t.account_id, t.to_account_id)]
    if card_id:
        rows = [t for t in rows if card_id in (t.card_id, t.to_card_id)]
    if category_id:
        rows = [t for t in rows if t.category_id == category_id]
    if kind:
        rows = [t for t in rows if t.kind == kind]
    if status:
        rows = [t for t in rows if t.status == status]
    if q:
        nq = normalize(q)
        rows = [t for t in rows if nq in normalize(t.description) or nq in normalize(" ".join(t.tags))]
    rows.sort(key=lambda t: (t.date, t.created_at), reverse=True)
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": len(rows)}


@router.post("", response_model=Transaction, status_code=201)
def create(body: TransactionCreate, repo: Repository = Depends(get_repo)):
    validate(repo, body)
    return repo.add("transactions", Transaction(**body.model_dump()))


@router.post("/installments", response_model=list[Transaction], status_code=201)
def create_installments(body: InstallmentsCreate, repo: Repository = Depends(get_repo)):
    validate(repo, body)
    if not body.card_id:
        raise ApiError(400, "Parcelamento só em cartão de crédito.", "card_id")
    return repo.add_many("transactions", build_installments(body, body.total))


def _group(repo: Repository, tx: Transaction, scope: str) -> list[Transaction]:
    if scope == "remaining" and tx.installment:
        return [t for t in repo.list("transactions")
                if t.installment and t.installment.group_id == tx.installment.group_id
                and t.installment.number >= tx.installment.number]
    return [tx]


@router.put("/{id}", response_model=Transaction)
def update(id: str, body: dict, scope: Literal["one", "remaining"] = "one",
           repo: Repository = Depends(get_repo)):
    tx = repo.get("transactions", id)
    if tx is None:
        raise ApiError(404, "Lançamento não encontrado.")
    merged = TransactionCreate(**{**tx.model_dump(exclude={"id", "created_at", "updated_at"}), **body})
    validate(repo, merged)
    result = None
    for t in _group(repo, tx, scope):
        data = dict(body)
        if t.installment and "description" in data and t.id != tx.id:
            data["description"] = f"{data['description']} ({t.installment.number}/{t.installment.total})"
        elif t.installment and "description" in data:
            data["description"] = f"{data['description']} ({t.installment.number}/{t.installment.total})"
        if t.id != tx.id:
            data.pop("date", None)
            data.pop("amount", None)
        updated = repo.update("transactions", t.id, data)
        if t.id == tx.id:
            result = updated
    return result


@router.delete("/{id}", status_code=204)
def delete(id: str, scope: Literal["one", "remaining"] = "one", repo: Repository = Depends(get_repo)):
    tx = repo.get("transactions", id)
    if tx is None:
        raise ApiError(404, "Lançamento não encontrado.")
    repo.delete_many("transactions", [t.id for t in _group(repo, tx, scope)])
    return Response(status_code=204)
