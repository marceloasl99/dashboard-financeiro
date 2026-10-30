"""Statement import: preview (parse + suggest + dedupe) then commit the approved rows."""
import re
import time
import uuid

from fastapi import APIRouter, Depends, Form, Request, UploadFile
from pydantic import BaseModel

from server.deps import get_repo
from server.errors import ApiError
from server.importers.base import ImportedRow, detect, find_duplicates
from server.models import Transaction
from server.services.categorizer import normalize, suggest
from server.storage.base import Repository

router = APIRouter(prefix="/api/import", tags=["import"])
PREVIEW_TTL = 3600
CARD_INCOME_WORDS = re.compile(r"pagamento|estorno|credito|reembolso|devolucao", re.I)


class CommitRow(BaseModel):
    index: int
    include: bool = True
    category_id: str | None = None
    kind: str | None = None
    description: str | None = None
    amount: int | None = None
    date: str | None = None


class CommitBody(BaseModel):
    import_id: str
    rows: list[CommitRow]


def _previews(request: Request) -> dict:
    store = getattr(request.app.state, "import_previews", None)
    if store is None:
        store = request.app.state.import_previews = {}
    now = time.time()
    for k in [k for k, v in store.items() if now - v["created"] > PREVIEW_TTL]:
        del store[k]
    return store


@router.post("/preview")
async def preview(request: Request, file: UploadFile, account_id: str | None = Form(None),
                  card_id: str | None = Form(None), repo: Repository = Depends(get_repo)):
    if bool(account_id) == bool(card_id):
        raise ApiError(400, "Escolha a conta ou o cartão de destino.", "account_id")
    if account_id and repo.get("accounts", account_id) is None:
        raise ApiError(400, "Conta não encontrada.", "account_id")
    if card_id and repo.get("cards", card_id) is None:
        raise ApiError(400, "Cartão não encontrado.", "card_id")
    content = await file.read()
    try:
        rows = detect(file.filename or "arquivo", content)
    except ValueError as e:
        raise ApiError(400, str(e), "file")
    except Exception as e:  # corrupted file, unexpected layout
        raise ApiError(400, f"Não consegui ler o arquivo: {type(e).__name__}", "file")
    existing = repo.list("transactions")
    dups = find_duplicates(rows, existing)
    rules = repo.list("rules")
    history = [t for t in existing if t.description and t.category_id][-2000:]
    import_id = str(uuid.uuid4())
    out = []
    for i, r in enumerate(rows):
        if card_id:
            # card statements list purchases as positive; only payments/refunds are credits
            kind = "income" if CARD_INCOME_WORDS.search(normalize(r.description)) else "expense"
        else:
            kind = "income" if r.amount > 0 else "expense"
        include = i not in dups and not (card_id and kind == "income")
        out.append({"index": i, "date": r.date.isoformat(), "amount": abs(r.amount), "kind": kind,
                    "description": r.description, "fitid": r.fitid,
                    "suggested_category_id": suggest(r.description, rules, history),
                    "duplicate_of": dups.get(i), "include": include})
    _previews(request)[import_id] = {"created": time.time(), "rows": rows, "account_id": account_id,
                                     "card_id": card_id, "filename": file.filename}
    return {"import_id": import_id, "filename": file.filename, "rows": out, "duplicates": len(dups)}


@router.post("/commit", status_code=201)
def commit(request: Request, body: CommitBody, repo: Repository = Depends(get_repo)):
    store = _previews(request)
    pv = store.get(body.import_id)
    if pv is None:
        raise ApiError(404, "Pré-visualização expirada. Envie o arquivo novamente.", "import_id")
    rows: list[ImportedRow] = pv["rows"]
    new: list[Transaction] = []
    for cr in body.rows:
        if not cr.include or not (0 <= cr.index < len(rows)):
            continue
        r = rows[cr.index]
        kind = cr.kind or ("income" if r.amount > 0 and not pv["card_id"] else "expense")
        if kind not in ("expense", "income"):
            raise ApiError(400, "Tipo inválido na importação.", "kind")
        import_tag = f"ofx:{r.fitid}" if r.fitid else f"file:{body.import_id}:{cr.index}"
        new.append(Transaction(date=cr.date or r.date.isoformat(), amount=cr.amount or abs(r.amount), kind=kind,
                               category_id=cr.category_id, account_id=pv["account_id"], card_id=pv["card_id"],
                               description=(cr.description if cr.description is not None else r.description)[:200],
                               import_id=import_tag))
    if new:
        repo.add_many("transactions", new)
    del store[body.import_id]
    return {"created": len(new)}
