"""Generic PDF statement reader: any text line shaped like `date  description  amount [D|C]`."""
from __future__ import annotations

import io
import re

import pdfplumber

from server.importers.base import ImportedRow, parse_amount_br, parse_date

LINE = re.compile(
    r"^(?P<date>\d{2}/\d{2}(?:/\d{2,4})?)\s+(?P<desc>.+?)\s+"
    r"(?P<amount>-?\s?R?\$?\s?\(?-?[\d.]*\d,\d{2}\)?-?)\s*(?P<dc>[DC])?\s*$"
)
SKIP = re.compile(r"\b(total|saldo|limite|vencimento|fechamento|subtotal)\b", re.I)


def parse_text(text: str, default_year: int | None) -> list[ImportedRow]:
    out: list[ImportedRow] = []
    for raw in text.splitlines():
        line = raw.strip()
        m = LINE.match(line)
        if not m or SKIP.search(m.group("desc")):
            continue
        d = parse_date(m.group("date"), default_year)
        amount = parse_amount_br(m.group("amount"))
        if d is None or amount is None or amount == 0:
            continue
        if m.group("dc") == "D":
            amount = -abs(amount)
        elif m.group("dc") == "C":
            amount = abs(amount)
        out.append(ImportedRow(date=d, amount=amount, description=m.group("desc").strip(), fitid=None, raw=line))
    return out


def parse(content: bytes, default_year: int | None = None) -> list[ImportedRow]:
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    if default_year is None:
        m = re.search(r"\d{2}/\d{2}/(20\d{2})", text)
        default_year = int(m.group(1)) if m else None
    rows = parse_text(text, default_year)
    if not rows:
        raise ValueError("Não encontrei linhas de lançamento no PDF (texto pode estar como imagem).")
    return rows
