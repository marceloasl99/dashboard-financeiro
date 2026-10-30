import io
import zlib
from datetime import date

import openpyxl
import pytest

from server.importers.base import ImportedRow, detect, find_duplicates, parse_amount_br
from server.models import Transaction


def test_parse_amount_variants():
    assert parse_amount_br("1.234,56") == 123456
    assert parse_amount_br("-45,90") == -4590
    assert parse_amount_br("R$ 12,00") == 1200
    assert parse_amount_br("1234.56") == 123456
    assert parse_amount_br("(100,00)") == -10000
    assert parse_amount_br("R$ -1.000,10") == -100010
    assert parse_amount_br("") is None


CSV_SINGLE = "Data;Descrição;Valor\n01/10/2026;IFOOD *RESTAURANTE;-48,90\n05/10/2026;PIX RECEBIDO;1.200,00\n"
CSV_DEBIT_CREDIT = "data,historico,debito,credito\n2026-10-03,POSTO SHELL,250.00,\n2026-10-04,SALARIO,,9800.00\n"


def test_csv_single_value_column():
    rows = detect("extrato.csv", CSV_SINGLE.encode("utf-8"))
    assert [(r.date, r.amount, r.description) for r in rows] == [
        (date(2026, 10, 1), -4890, "IFOOD *RESTAURANTE"),
        (date(2026, 10, 5), 120000, "PIX RECEBIDO")]


def test_csv_debit_credit_columns_latin1():
    rows = detect("extrato.csv", CSV_DEBIT_CREDIT.encode("latin-1"))
    assert [(r.amount, r.description) for r in rows] == [(-25000, "POSTO SHELL"), (980000, "SALARIO")]


def test_xlsx_basic():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Fatura cartão"])  # title row above the header
    ws.append(["Data", "Lançamento", "Valor (R$)"])
    ws.append([date(2026, 10, 2), "AMAZON BR", 199.9])
    ws.append(["03/10/2026", "NETFLIX", "55,90"])
    buf = io.BytesIO()
    wb.save(buf)
    rows = detect("fatura.xlsx", buf.getvalue())
    assert [(r.date, r.amount, r.description) for r in rows] == [
        (date(2026, 10, 2), 19990, "AMAZON BR"), (date(2026, 10, 3), 5590, "NETFLIX")]


OFX = """OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-250.00<FITID>abc123<MEMO>POSTO SHELL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261004<TRNAMT>9800.00<FITID>def456<NAME>SALARIO EMPRESA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""


def test_ofx_fitid():
    rows = detect("extrato.ofx", OFX.encode("latin-1"))
    assert [(r.date, r.amount, r.description, r.fitid) for r in rows] == [
        (date(2026, 10, 3), -25000, "POSTO SHELL", "abc123"),
        (date(2026, 10, 4), 980000, "SALARIO EMPRESA", "def456")]


def minimal_pdf(lines: list[str]) -> bytes:
    content = "BT /F1 11 Tf 40 760 Td 14 TL " + " ".join(f"({l}) Tj T*" for l in lines) + " ET"
    stream = content.encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + o + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def test_pdf_lines():
    pdf = minimal_pdf(["FATURA CARTAO - Vencimento 05/11/2026", "Lancamentos",
                       "02/10/2026 AMAZON BR 199,90", "03/10 NETFLIX.COM 55,90",
                       "04/10/2026 PAGAMENTO RECEBIDO -1.500,00 C", "Total 255,80"])
    rows = detect("fatura-2026-11.pdf", pdf)
    assert [(r.date, r.amount, r.description) for r in rows] == [
        (date(2026, 10, 2), 19990, "AMAZON BR"),
        (date(2026, 10, 3), 5590, "NETFLIX.COM"),
        (date(2026, 10, 4), 150000, "PAGAMENTO RECEBIDO")]


def test_duplicate_detection():
    existing = [Transaction(id="t1", date="2026-10-01", amount=4890, account_id="a", description="Ifood Restaurante"),
                Transaction(id="t2", date="2026-10-02", amount=100, account_id="a", description="x", import_id="ofx:zzz")]
    rows = [ImportedRow(date=date(2026, 10, 1), amount=-4890, description="IFOOD *RESTAURANTE", fitid=None, raw=""),
            ImportedRow(date=date(2026, 10, 9), amount=-100, description="outra", fitid="zzz", raw=""),
            ImportedRow(date=date(2026, 10, 1), amount=-4890, description="Farmacia", fitid=None, raw="")]
    dup = find_duplicates(rows, existing)
    assert dup == {0: "t1", 1: "t2"}


def test_unsupported_extension():
    with pytest.raises(ValueError):
        detect("foto.png", b"...")


def test_preview_and_commit_api(client):
    acc = client.post("/api/accounts", json={"name": "Corrente"}).json()
    cats = client.get("/api/categories").json()
    food = next(c for c in cats if c["name"] == "Alimentação")
    client.post("/api/rules", json={"pattern": "ifood", "category_id": food["id"], "priority": 5})
    r = client.post("/api/import/preview", files={"file": ("extrato.csv", CSV_SINGLE.encode(), "text/csv")},
                    data={"account_id": acc["id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body["rows"]
    assert rows[0]["kind"] == "expense" and rows[0]["amount"] == 4890
    assert rows[0]["suggested_category_id"] == food["id"]
    assert rows[1]["kind"] == "income" and rows[1]["suggested_category_id"] is None
    rows[1]["include"] = False
    r = client.post("/api/import/commit", json={"import_id": body["import_id"], "rows": [
        {"index": 0, "include": True, "category_id": food["id"]},
        {"index": 1, "include": False}]})
    assert r.status_code == 201, r.text
    assert r.json()["created"] == 1
    txs = client.get("/api/transactions").json()["items"]
    assert len(txs) == 1 and txs[0]["import_id"] and txs[0]["category_id"] == food["id"]
    # same file again → marked duplicate
    r = client.post("/api/import/preview", files={"file": ("extrato.csv", CSV_SINGLE.encode(), "text/csv")},
                    data={"account_id": acc["id"]})
    assert r.json()["rows"][0]["duplicate_of"] == txs[0]["id"]
    assert r.json()["rows"][0]["include"] is False


def test_preview_card_marks_everything_expense_except_payment(client):
    card = client.post("/api/cards", json={"name": "Visa", "closing_day": 25, "due_day": 5}).json()
    csv = "Data;Descrição;Valor\n01/10/2026;AMAZON;199,90\n05/10/2026;PAGAMENTO FATURA;-1.000,00\n"
    r = client.post("/api/import/preview", files={"file": ("fatura.csv", csv.encode(), "text/csv")},
                    data={"card_id": card["id"]})
    rows = r.json()["rows"]
    assert rows[0]["kind"] == "expense" and rows[0]["include"] is True
    assert rows[1]["kind"] == "income" and rows[1]["include"] is False
