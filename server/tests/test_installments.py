from server.services.installments import build_installments, split_installments
from server.routers.transactions import TransactionCreate


def test_split_10001_by_12_sums_exact():
    parts = split_installments(10001, 12)
    assert len(parts) == 12
    assert sum(parts) == 10001
    assert parts[0] == 838
    assert all(p == 833 for p in parts[1:])


def test_split_even():
    assert split_installments(1200, 3) == [400, 400, 400]


def test_installments_dates_monthly():
    base = TransactionCreate(date="2026-01-31", amount=30000, kind="expense", card_id="c1",
                             category_id="k", description="TV")
    txs = build_installments(base, 3)
    assert [t.date for t in txs] == ["2026-01-31", "2026-02-28", "2026-03-31"]
    assert [t.description for t in txs] == ["TV (1/3)", "TV (2/3)", "TV (3/3)"]
    assert {t.installment.group_id for t in txs} == {txs[0].installment.group_id}
    assert [t.installment.number for t in txs] == [1, 2, 3]
    assert sum(t.amount for t in txs) == 30000
