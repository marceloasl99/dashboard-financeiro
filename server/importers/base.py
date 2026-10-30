"""Shared importer types, amount/date parsing, dispatch by extension, duplicate detection."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

from server.models import Transaction
from server.services.categorizer import jaccard, tokens

DUP_SIMILARITY = 0.6


@dataclass
class ImportedRow:
    date: date
    amount: int  # signed cents: negative = money out
    description: str
    fitid: str | None
    raw: str


_AMOUNT_CLEAN = re.compile(r"[^\d,.\-()]")


def parse_amount_br(s: str | float | int | None) -> int | None:
    if s is None:
        return None
    if isinstance(s, (int, float)) and not isinstance(s, bool):
        return round(float(s) * 100)
    text = str(s).strip()
    if not text:
        return None
    neg = text.startswith("(") and text.endswith(")") or "-" in text
    text = _AMOUNT_CLEAN.sub("", text).replace("(", "").replace(")", "").replace("-", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    elif text.count(".") > 1 or re.fullmatch(r"\d{1,3}\.\d{3}", text):
        text = text.replace(".", "")
    try:
        value = round(float(text) * 100)
    except ValueError:
        return None
    return -value if neg else value


_DATE_PATTERNS = ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%Y%m%d", "%d/%m"]


def parse_date(s, default_year: int | None = None) -> date | None:
    if isinstance(s, datetime):
        return s.date()
    if isinstance(s, date):
        return s
    text = str(s or "").strip()[:19]
    if not text:
        return None
    for fmt in _DATE_PATTERNS:
        if fmt == "%d/%m":
            m = re.fullmatch(r"(\d{2})/(\d{2})", text)
            if not m:
                continue
            try:
                return date(default_year or date.today().year, int(m.group(2)), int(m.group(1)))
            except ValueError:
                return None
        try:
            return datetime.strptime(text if fmt != "%Y%m%d" else text[:8], fmt).date()
        except ValueError:
            continue
    return None


def year_hint(filename: str) -> int | None:
    m = re.search(r"(20\d{2})", filename)
    return int(m.group(1)) if m else None


def detect(filename: str, content: bytes) -> list[ImportedRow]:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    from server.importers import csv_importer, ofx_importer, pdf_importer, xlsx_importer
    if ext in ("csv", "txt"):
        return csv_importer.parse(content, year_hint(filename))
    if ext in ("xlsx", "xlsm"):
        return xlsx_importer.parse(content, year_hint(filename))
    if ext in ("ofx", "qfx"):
        return ofx_importer.parse(content)
    if ext == "pdf":
        return pdf_importer.parse(content, year_hint(filename))
    raise ValueError(f"Formato não suportado: .{ext or '?'} (use CSV, XLSX, OFX ou PDF)")


def find_duplicates(rows: list[ImportedRow], existing: list[Transaction]) -> dict[int, str]:
    by_fitid = {t.import_id.split(":", 1)[1]: t.id for t in existing if t.import_id and t.import_id.startswith("ofx:")}
    by_key: dict[tuple[str, int], list[Transaction]] = {}
    for t in existing:
        by_key.setdefault((t.date, t.amount), []).append(t)
    out: dict[int, str] = {}
    for i, r in enumerate(rows):
        if r.fitid and r.fitid in by_fitid:
            out[i] = by_fitid[r.fitid]
            continue
        toks = tokens(r.description)
        for t in by_key.get((r.date.isoformat(), abs(r.amount)), []):
            if jaccard(toks, tokens(t.description)) >= DUP_SIMILARITY:
                out[i] = t.id
                break
    return out
