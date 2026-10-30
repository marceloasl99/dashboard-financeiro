"""Account balances derived from settled transactions."""
from __future__ import annotations

from server.models import Account, Transaction


def account_balance(account: Account, transactions: list[Transaction], until: str | None = None,
                    include_planned: bool = False) -> int:
    bal = account.initial_balance
    for t in transactions:
        if t.status != "settled" and not include_planned:
            continue
        if until and t.date > until:
            continue
        if t.kind == "income" and t.account_id == account.id:
            bal += t.amount
        elif t.kind == "expense" and t.account_id == account.id:
            bal -= t.amount
        elif t.kind == "transfer":
            if t.account_id == account.id:
                bal -= t.amount
            if t.to_account_id == account.id:
                bal += t.amount
    return bal


def total_balance(accounts: list[Account], transactions: list[Transaction]) -> int:
    return sum(account_balance(a, transactions) for a in accounts if not a.archived)
