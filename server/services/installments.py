"""Split a card purchase into N monthly installments without losing cents."""
from __future__ import annotations

import uuid

from pydantic import BaseModel

from server.models import Installment, Transaction
from server.services.dates import add_months, parse


def split_installments(amount: int, total: int) -> list[int]:
    base, rest = divmod(amount, total)
    return [base + rest] + [base] * (total - 1)


def build_installments(base: BaseModel, total: int) -> list[Transaction]:
    data = base.model_dump(exclude={"total"})
    first = parse(data["date"])
    desc = data.get("description") or ""
    group_id = str(uuid.uuid4())
    out = []
    for i, part in enumerate(split_installments(data["amount"], total)):
        row = dict(data)
        row["date"] = add_months(first, i).isoformat()
        row["amount"] = part
        row["description"] = f"{desc} ({i + 1}/{total})".strip()
        row["installment"] = Installment(group_id=group_id, number=i + 1, total=total)
        out.append(Transaction(**row))
    return out
