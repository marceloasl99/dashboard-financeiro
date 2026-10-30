"""CSV export of transactions with names resolved (pt-BR friendly: ';' and '1234,56')."""
from __future__ import annotations

import csv
import io

from server.models import Database

KIND_LABEL = {"expense": "Despesa", "income": "Receita", "transfer": "Transferência"}
STATUS_LABEL = {"settled": "Efetivado", "planned": "Previsto"}


def cents_br(v: int) -> str:
    sign = "-" if v < 0 else ""
    v = abs(v)
    return f"{sign}{v // 100},{v % 100:02d}"


def to_csv(db: Database) -> str:
    accounts = {a.id: a.name for a in db.accounts}
    cards = {c.id: c.name for c in db.cards}
    cats = {c.id: c.name for c in db.categories}
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow(["Data", "Tipo", "Categoria", "Descrição", "Origem", "Destino", "Parcela",
                "Valor", "Status", "Tags"])
    for t in sorted(db.transactions, key=lambda t: t.date):
        origin = accounts.get(t.account_id or "") or cards.get(t.card_id or "") or ""
        dest = accounts.get(t.to_account_id or "") or cards.get(t.to_card_id or "") or ""
        inst = f"{t.installment.number}/{t.installment.total}" if t.installment else ""
        w.writerow([t.date, KIND_LABEL[t.kind], cats.get(t.category_id or "", ""), t.description,
                    origin, dest, inst, cents_br(t.amount), STATUS_LABEL[t.status], " ".join(t.tags)])
    return "﻿" + buf.getvalue()
