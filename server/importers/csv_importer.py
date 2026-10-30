import csv
import io

from server.importers.base import ImportedRow
from server.importers.tabular import rows_from_table


def decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def parse(content: bytes, default_year: int | None = None) -> list[ImportedRow]:
    text = decode(content)
    sample = "\n".join(text.splitlines()[:20])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    table = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    return rows_from_table(table, default_year)
