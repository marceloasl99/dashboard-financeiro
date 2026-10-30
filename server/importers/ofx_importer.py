"""OFX (SGML flavour used by Brazilian banks). No external dependency."""
import re

from server.importers.base import ImportedRow, parse_amount_br, parse_date

_TRN = re.compile(r"<STMTTRN>(.*?)</STMTTRN>", re.S | re.I)


def _tag(block: str, name: str) -> str | None:
    m = re.search(rf"<{name}>([^<\r\n]*)", block, re.I)
    return m.group(1).strip() if m else None


def parse(content: bytes) -> list[ImportedRow]:
    text = content.decode("utf-8", errors="ignore") if b"UTF-8" in content[:300].upper() else content.decode("latin-1", errors="ignore")
    out: list[ImportedRow] = []
    for m in _TRN.finditer(text):
        block = m.group(1)
        d = parse_date((_tag(block, "DTPOSTED") or "")[:8])
        amount_raw = (_tag(block, "TRNAMT") or "").replace(",", ".")
        amount = parse_amount_br(amount_raw) if amount_raw else None
        if d is None or amount is None:
            continue
        desc = _tag(block, "MEMO") or _tag(block, "NAME") or ""
        out.append(ImportedRow(date=d, amount=amount, description=desc, fitid=_tag(block, "FITID"), raw=block.strip()))
    if not out:
        raise ValueError("Arquivo OFX sem transações (<STMTTRN>).")
    return out
