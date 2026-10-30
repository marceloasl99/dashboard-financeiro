import io

import openpyxl

from server.importers.base import ImportedRow
from server.importers.tabular import rows_from_table


def parse(content: bytes, default_year: int | None = None) -> list[ImportedRow]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    errors = []
    for ws in wb.worksheets:
        table = [list(r) for r in ws.iter_rows(values_only=True)]
        try:
            rows = rows_from_table(table, default_year)
        except ValueError as e:
            errors.append(str(e))
            continue
        if rows:
            return rows
    raise ValueError(errors[0] if errors else "Planilha sem lançamentos reconhecíveis.")
