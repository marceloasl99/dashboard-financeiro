"""Card statements: list computed statements and register a payment."""
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from server.deps import get_repo
from server.errors import ApiError
from server.models import Card, Transaction
from server.services.statements import Statement, build_statements
from server.storage.base import Repository

router = APIRouter(prefix="/api/cards", tags=["statements"])


class PayBody(BaseModel):
    account_id: str
    amount: int = Field(gt=0)
    date: str


def _card(repo: Repository, id: str) -> Card:
    card = repo.get("cards", id)
    if card is None:
        raise ApiError(404, "Cartão não encontrado.")
    return card  # type: ignore[return-value]


def statements_for(repo: Repository, card: Card, today: date | None = None) -> list[Statement]:
    txs = repo.list("transactions")
    return build_statements(card, txs, txs, today or date.today())  # type: ignore[arg-type]


@router.get("/{id}/statements", response_model=list[Statement])
def list_statements(id: str, from_: str | None = Query(None, alias="from"), to: str | None = None,
                    repo: Repository = Depends(get_repo)):
    sts = statements_for(repo, _card(repo, id))
    if from_:
        sts = [s for s in sts if s.period >= from_]
    if to:
        sts = [s for s in sts if s.period <= to]
    return sts


@router.post("/{id}/statements/{period}/pay", response_model=Transaction, status_code=201)
def pay_statement(id: str, period: str, body: PayBody, repo: Repository = Depends(get_repo)):
    card = _card(repo, id)
    if repo.get("accounts", body.account_id) is None:
        raise ApiError(404, "Conta não encontrada.", "account_id")
    tx = Transaction(date=body.date, amount=body.amount, kind="transfer", account_id=body.account_id,
                     to_card_id=card.id, description=f"Pagamento fatura {period}",
                     tags=[f"statement:{period}"])
    return repo.add("transactions", tx)
