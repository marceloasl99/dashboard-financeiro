"""Header detection shared by CSV and XLSX: find the row with date/description/value columns."""
from __future__ import annotations

from server.importers.base import ImportedRow, parse_amount_br, parse_date
from server.services.categorizer import normalize

DATE_COLS = ("data", "date", "dt")
DESC_COLS = ("descricao", "historico", "lancamento", "description", "memo", "estabelecimento", "titulo")
VALUE_COLS = ("valor", "value", "amount", "montante")
DEBIT_COLS = ("debito", "saida", "debit")
CREDIT_COLS = ("credito", "entrada", "credit")


def _find(headers: list[str], names: tuple[str, ...]) -> int:
    for i, h in enumerate(headers):
        if any(h == n or h.startswith(n) for n in names):
            return i
    return -1


def rows_from_table(table: list[list], default_year: int | None) -> list[ImportedRow]:
    header_idx = -1
    cols = {}
    for i, row in enumerate(table[:30]):
        headers = [normalize(str(c or "")) for c in row]
        d, desc = _find(headers, DATE_COLS), _find(headers, DESC_COLS)
        v, deb, cred = _find(headers, VALUE_COLS), _find(headers, DEBIT_COLS), _find(headers, CREDIT_COLS)
        if d >= 0 and desc >= 0 and (v >= 0 or deb >= 0 or cred >= 0):
            header_idx, cols = i, {"date": d, "desc": desc, "value": v, "debit": deb, "credit": cred}
            break
    if header_idx < 0:
        raise ValueError("Não encontrei as colunas de data, descrição e valor no arquivo.")
    out: list[ImportedRow] = []
    for row in table[header_idx + 1:]:
        if not row or all(c in (None, "") for c in row):
            continue
        get = lambda k: row[cols[k]] if 0 <= cols[k] < len(row) else None  # noqa: E731
        d = parse_date(get("date"), default_year)
        if d is None:
            continue
        if cols["value"] >= 0:
            amount = parse_amount_br(get("value"))
        else:
            deb, cred = parse_amount_br(get("debit")), parse_amount_br(get("credit"))
            amount = (cred or 0) - abs(deb or 0) if (deb or cred) else None
        if amount is None or amount == 0:
            continue
        desc = str(get("desc") or "").strip()
        out.append(ImportedRow(date=d, amount=amount, description=desc, fitid=None,
                               raw=";".join(str(c) for c in row if c is not None)))
    return out
