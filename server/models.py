"""Pydantic models for Finance OS. Money is int cents; dates are YYYY-MM-DD strings."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

AccountType = Literal["checking", "savings", "wallet", "fgts"]
CategoryKind = Literal["expense", "income"]
TransactionKind = Literal["expense", "income", "transfer"]
TransactionStatus = Literal["settled", "planned"]
Frequency = Literal["monthly", "yearly", "weekly"]
InvestmentStatus = Literal["active", "redeemed", "matured"]
Theme = Literal["light", "dark", "auto"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def new_id() -> str:
    return str(uuid.uuid4())


class Entity(BaseModel):
    id: str = Field(default_factory=new_id)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Account(Entity):
    name: str = Field(min_length=1)
    type: AccountType = "checking"
    initial_balance: int = 0
    color: str = "#1B3A4B"
    archived: bool = False


class Card(Entity):
    name: str = Field(min_length=1)
    brand: str = ""
    closing_day: int = Field(ge=1, le=31)
    due_day: int = Field(ge=1, le=31)
    limit: int = 0
    payment_account_id: str | None = None
    color: str = "#285568"
    archived: bool = False


class Category(Entity):
    name: str = Field(min_length=1)
    kind: CategoryKind = "expense"
    icon: str = "tag"
    color: str = "#6F95A1"
    group: str | None = None


class Installment(BaseModel):
    group_id: str
    number: int = Field(ge=1)
    total: int = Field(ge=2)


class Transaction(Entity):
    date: str
    amount: int = Field(gt=0)
    kind: TransactionKind = "expense"
    category_id: str | None = None
    account_id: str | None = None
    card_id: str | None = None
    to_account_id: str | None = None
    to_card_id: str | None = None
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    installment: Installment | None = None
    recurrence_id: str | None = None
    recurrence_date: str | None = None  # original occurrence date; survives moving the row
    import_id: str | None = None
    goal_id: str | None = None
    status: TransactionStatus = "settled"


class Recurrence(Entity):
    description: str = ""
    amount: int = Field(gt=0)
    kind: TransactionKind = "expense"
    category_id: str | None = None
    account_id: str | None = None
    card_id: str | None = None
    to_account_id: str | None = None
    goal_id: str | None = None
    frequency: Frequency = "monthly"
    day: int = Field(default=1, ge=0, le=31)
    start_date: str
    end_date: str | None = None
    active: bool = True
    skipped_dates: list[str] = Field(default_factory=list)  # planned occurrences the user deleted


class Budget(Entity):
    category_id: str
    amount: int = Field(ge=0)
    overrides: dict[str, int] = Field(default_factory=dict)


class Goal(Entity):
    name: str = Field(min_length=1)
    target: int = Field(gt=0)
    deadline: str | None = None
    color: str = "#24735B"


class Investment(Entity):
    asset: str = Field(min_length=1)
    class_: str = Field(default="Outros", alias="class")
    institution: str = ""
    quantity: float = 1
    cost: int = 0
    current_value: int = 0
    maturity: str | None = None
    liquidity: str = ""
    status: InvestmentStatus = "active"
    ticker: str | None = None
    quote_source: Literal["brapi", "coingecko"] | None = None

    model_config = {"populate_by_name": True}


class Contribution(Entity):
    investment_id: str
    date: str
    amount: int = Field(gt=0)


class CategoryRule(Entity):
    pattern: str = Field(min_length=1)
    category_id: str
    priority: int = 0


class Settings(BaseModel):
    currency: str = "BRL"
    theme: Theme = "auto"
    quotes_enabled: bool = False
    quotes_api_key: str = ""
    backup_keep_days: int = 30


class Database(BaseModel):
    version: int = 1
    accounts: list[Account] = Field(default_factory=list)
    cards: list[Card] = Field(default_factory=list)
    categories: list[Category] = Field(default_factory=list)
    transactions: list[Transaction] = Field(default_factory=list)
    recurrences: list[Recurrence] = Field(default_factory=list)
    budgets: list[Budget] = Field(default_factory=list)
    goals: list[Goal] = Field(default_factory=list)
    investments: list[Investment] = Field(default_factory=list)
    contributions: list[Contribution] = Field(default_factory=list)
    rules: list[CategoryRule] = Field(default_factory=list)
    settings: Settings = Field(default_factory=Settings)


COLLECTIONS: dict[str, type[Entity]] = {
    "accounts": Account,
    "cards": Card,
    "categories": Category,
    "transactions": Transaction,
    "recurrences": Recurrence,
    "budgets": Budget,
    "goals": Goal,
    "investments": Investment,
    "contributions": Contribution,
    "rules": CategoryRule,
}

# (name, kind, icon, color, group)
DEFAULT_CATEGORIES: list[tuple[str, CategoryKind, str, str, str | None]] = [
    ("Moradia", "expense", "home", "#2a78d6", "Casa"),
    ("Contas", "expense", "zap", "#eda100", "Casa"),
    ("Alimentação", "expense", "utensils", "#eb6834", None),
    ("Transporte", "expense", "car", "#1baf7a", None),
    ("Saúde", "expense", "heart", "#008300", None),
    ("Assinaturas", "expense", "repeat", "#e34948", None),
    ("Mensalidades", "expense", "calendar", "#7b6f5e", None),
    ("Impostos", "expense", "landmark", "#5c6b73", None),
    ("Lazer", "expense", "smile", "#e87ba4", None),
    ("Compras", "expense", "shopping-bag", "#6250d6", None),
    ("Educação", "expense", "book", "#4f7f9f", None),
    ("Cuidados pessoais", "expense", "scissors", "#b08aa0", None),
    ("Pet", "expense", "paw", "#8a9a4a", None),
    ("Outros", "expense", "more-horizontal", "#898781", None),
    ("Salário", "income", "briefcase", "#1c5cab", None),
    ("FGTS", "income", "shield", "#184f95", None),
    ("Extra", "income", "plus-circle", "#256abf", None),
    ("Rendimentos", "income", "trending-up", "#3987e5", None),
    ("Outras receitas", "income", "gift", "#6da7ec", None),
]


def default_categories() -> list[Category]:
    return [
        Category(name=n, kind=k, icon=i, color=c, group=g)
        for n, k, i, c, g in DEFAULT_CATEGORIES
    ]
