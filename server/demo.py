"""Deterministic demo dataset: 14 months of plausible personal finances. No real data."""
from __future__ import annotations

import random
import uuid
from datetime import date, timedelta

from server.models import (
    Account, Budget, Card, CategoryRule, Contribution, Database, Goal,
    Installment, Investment, Recurrence, Transaction, default_categories,
)
from server.services.dates import add_months, clamp_day, month_key


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def build_demo(today: date, seed: int = 42) -> Database:
    rng = random.Random(seed)
    stamp = f"{today.isoformat()}T12:00:00+00:00"

    def ent(cls, **kw):
        return cls(id=_uuid(rng), created_at=stamp, updated_at=stamp, **kw)

    db = Database()
    db.categories = [
        c.model_copy(update={"id": _uuid(rng), "created_at": stamp, "updated_at": stamp})
        for c in default_categories()
    ]
    cat = {c.name: c.id for c in db.categories}

    checking = ent(Account, name="Conta corrente", type="checking", initial_balance=4_250_00, color="#1B3A4B")
    savings = ent(Account, name="Poupança", type="savings", initial_balance=12_000_00, color="#24735B")
    fgts_acc = ent(Account, name="FGTS", type="fgts", initial_balance=38_400_00, color="#486A60")
    db.accounts = [checking, savings, fgts_acc]

    card_a = ent(Card, name="Cartão Principal", brand="Visa", closing_day=25, due_day=5,
                 limit=8_000_00, payment_account_id=checking.id, color="#285568")
    card_b = ent(Card, name="Cartão Compras", brand="Mastercard", closing_day=10, due_day=20,
                 limit=4_000_00, payment_account_id=checking.id, color="#A46A5D")
    db.cards = [card_a, card_b]

    start = add_months(date(today.year, today.month, 1), -13)
    months = [add_months(start, i) for i in range(14)]
    horizon = add_months(today, 2)

    # --- recurrences --------------------------------------------------------
    rec_defs = [
        ("Salário", "income", "Salário", 9_800_00, 5, checking.id, None),
        ("FGTS (8% do bruto)", "income", "FGTS", 784_00, 7, fgts_acc.id, None),
        ("Aluguel", "expense", "Moradia", 2_650_00, 10, checking.id, None),
        ("Condomínio", "expense", "Moradia", 620_00, 10, checking.id, None),
        ("Internet fibra", "expense", "Contas", 119_90, 15, checking.id, None),
        ("Netflix", "expense", "Assinaturas", 55_90, 12, None, card_a.id),
        ("Spotify", "expense", "Assinaturas", 21_90, 12, None, card_a.id),
        ("iCloud", "expense", "Assinaturas", 14_90, 3, None, card_a.id),
        ("Academia", "expense", "Assinaturas", 149_90, 8, None, card_a.id),
        ("Curso de inglês", "expense", "Mensalidades", 389_00, 15, checking.id, None),
        ("Plano de saúde", "expense", "Saúde", 612_40, 20, checking.id, None),
    ]
    variable = {"Condomínio": 0.04}
    recs = []
    for desc, kind, cname, amount, day, acc, card in rec_defs:
        r = ent(Recurrence, description=desc, kind=kind, category_id=cat[cname], amount=amount,
                day=day, account_id=acc, card_id=card, start_date=months[0].isoformat())
        recs.append(r)
    recs.append(ent(Recurrence, description="IPVA", kind="expense", category_id=cat["Impostos"],
                    amount=1_890_00, frequency="yearly", day=20, account_id=checking.id,
                    start_date=date(months[0].year, 1, 20).isoformat()))
    recs.append(ent(Recurrence, description="IPTU", kind="expense", category_id=cat["Impostos"],
                    amount=1_420_00, frequency="yearly", day=15, account_id=checking.id,
                    start_date=date(months[0].year, 2, 15).isoformat()))
    db.recurrences = recs

    tx: list[Transaction] = []

    def add_tx(**kw) -> Transaction:
        t = ent(Transaction, **kw)
        tx.append(t)
        return t

    for r in recs:
        for m in months + [add_months(months[-1], 1), add_months(months[-1], 2)]:
            if r.frequency == "yearly":
                sd = date.fromisoformat(r.start_date)
                if m.month != sd.month:
                    continue
                d = clamp_day(m.year, m.month, r.day)
            else:
                d = clamp_day(m.year, m.month, r.day)
            if d < date.fromisoformat(r.start_date) or d > horizon:
                continue
            amount = r.amount
            if r.description in variable:
                amount = round(amount * (1 + rng.uniform(-variable[r.description], variable[r.description])))
            add_tx(date=d.isoformat(), amount=amount, kind=r.kind, category_id=r.category_id,
                   account_id=r.account_id, card_id=r.card_id, description=r.description,
                   recurrence_id=r.id, status="settled" if d <= today else "planned")

    # --- variable monthly spending ------------------------------------------
    def spend(d: date, amount: int, cname: str, desc: str, card: str | None = None, acc: str | None = None):
        if d > today:
            return
        add_tx(date=d.isoformat(), amount=amount, kind="expense", category_id=cat[cname],
               card_id=card, account_id=None if card else (acc or checking.id), description=desc)

    markets = ["Supermercado Pão de Açúcar", "Carrefour", "Mercado da esquina", "Hortifruti"]
    restaurants = ["iFood", "Restaurante Sabor Caseiro", "Padaria Bela Vista", "Pizzaria Napoli", "Sushi Yama"]
    transport = ["Uber", "99 Táxi", "Posto Shell", "Recarga Bilhete Único"]
    shopping = ["Amazon", "Mercado Livre", "Renner", "Shopee", "Decathlon"]
    leisure = ["Cinema", "Show", "Bar do Zé", "Teatro Municipal", "Parque aquático"]
    health = ["Drogasil", "Consulta dermatologista", "Exames laboratoriais", "Dentista"]
    personal = ["Barbearia", "Salão", "Perfumaria"]

    for m in months:
        # utilities with seasonal variation
        energy = round(185_00 * (1.35 if m.month in (1, 2, 12) else 1.0) * rng.uniform(0.9, 1.1))
        spend(clamp_day(m.year, m.month, 18), energy, "Contas", "Conta de luz (Enel)")
        spend(clamp_day(m.year, m.month, 22), round(92_00 * rng.uniform(0.85, 1.15)), "Contas", "Conta de água (Sabesp)")
        spend(clamp_day(m.year, m.month, 9), round(68_00 * rng.uniform(0.9, 1.1)), "Contas", "Gás encanado")
        spend(clamp_day(m.year, m.month, 4), 89_90, "Contas", "Celular (Vivo)", card=card_a.id)
        # weekly groceries + restaurants
        d = clamp_day(m.year, m.month, 2)
        while d.month == m.month:
            spend(d, round(rng.uniform(220_00, 420_00)), "Alimentação", rng.choice(markets), card=card_a.id)
            for _ in range(rng.randint(1, 3)):
                spend(d + timedelta(days=rng.randint(0, 6)), round(rng.uniform(32_00, 140_00)),
                      "Alimentação", rng.choice(restaurants), card=card_a.id)
            spend(d + timedelta(days=rng.randint(0, 6)), round(rng.uniform(18_00, 95_00)),
                  "Transporte", rng.choice(transport), card=card_a.id)
            d += timedelta(days=7)
        # fuel
        spend(clamp_day(m.year, m.month, 14), round(rng.uniform(240_00, 330_00)), "Transporte", "Posto Ipiranga", card=card_a.id)
        # pet
        spend(clamp_day(m.year, m.month, 6), round(rng.uniform(140_00, 210_00)), "Pet", "Petz ração e areia", card=card_b.id)
        # occasional
        for _ in range(rng.randint(1, 3)):
            spend(clamp_day(m.year, m.month, rng.randint(1, 28)), round(rng.uniform(45_00, 380_00)), "Compras", rng.choice(shopping), card=card_b.id)
        for _ in range(rng.randint(1, 2)):
            spend(clamp_day(m.year, m.month, rng.randint(1, 28)), round(rng.uniform(40_00, 260_00)), "Lazer", rng.choice(leisure), card=card_a.id)
        if rng.random() < 0.6:
            spend(clamp_day(m.year, m.month, rng.randint(1, 28)), round(rng.uniform(35_00, 420_00)), "Saúde", rng.choice(health), card=card_a.id)
        spend(clamp_day(m.year, m.month, rng.randint(1, 28)), round(rng.uniform(45_00, 160_00)), "Cuidados pessoais", rng.choice(personal))
        # savings transfer
        d = clamp_day(m.year, m.month, 6)
        if d <= today:
            add_tx(date=d.isoformat(), amount=800_00, kind="transfer", account_id=checking.id,
                   to_account_id=savings.id, description="Reserva mensal")
        # extra income sometimes
        if rng.random() < 0.3:
            d = clamp_day(m.year, m.month, rng.randint(10, 27))
            if d <= today:
                add_tx(date=d.isoformat(), amount=round(rng.uniform(400_00, 1_500_00)), kind="income",
                       category_id=cat["Extra"], account_id=checking.id, description="Freelance")

    # --- installments ---------------------------------------------------------
    def installments(first: date, total_amount: int, n: int, desc: str, cname: str, card: str):
        gid = _uuid(rng)
        base, rest = divmod(total_amount, n)
        for i in range(n):
            d = add_months(first, i)
            if d > horizon:
                break
            add_tx(date=d.isoformat(), amount=base + (rest if i == 0 else 0), kind="expense",
                   category_id=cat[cname], card_id=card, description=f"{desc} ({i + 1}/{n})",
                   installment=Installment(group_id=gid, number=i + 1, total=n),
                   status="settled" if d <= today else "planned")

    installments(add_months(today, -9), 3_499_00, 10, "Notebook Dell", "Compras", card_b.id)
    installments(add_months(today, -4), 1_890_00, 6, "Passagens aéreas", "Lazer", card_a.id)
    installments(add_months(today, -2), 2_200_00, 12, "Sofá", "Moradia", card_b.id)
    installments(add_months(today, -1), 640_00, 4, "Tênis de corrida", "Compras", card_a.id)

    # --- trip ---------------------------------------------------------------
    trip = add_months(today, -3)
    for i, (desc, amt) in enumerate([("Hotel Praia Grande", 1_280_00), ("Restaurante na praia", 240_00),
                                     ("Passeio de barco", 180_00), ("Aluguel de carro", 560_00)]):
        spend(clamp_day(trip.year, trip.month, 12 + i), amt, "Lazer", desc, card=card_a.id)

    # --- card statement payments (settled past statements) --------------------
    for card in db.cards:
        for m in months:
            due = clamp_day(m.year, m.month, card.due_day)
            if due > today:
                continue
            period = month_key(due)
            # statement window: (previous closing, this closing]; closing before due
            close = clamp_day(m.year, m.month, card.closing_day)
            if close >= due:
                close = add_months(close, -1)
            open_ = add_months(close, -1) + timedelta(days=1)
            total = sum(t.amount for t in tx if t.card_id == card.id and t.kind == "expense"
                        and open_.isoformat() <= t.date <= close.isoformat())
            if total:
                add_tx(date=due.isoformat(), amount=total, kind="transfer", account_id=checking.id,
                       to_card_id=card.id, description=f"Pagamento fatura {period}",
                       tags=[f"statement:{period}"])

    # --- investments ----------------------------------------------------------
    inv_defs = [
        ("Tesouro Selic 2029", "Tesouro Direto", "Tesouro Nacional", 12_000_00, 12_980_00, "2029-03-01", "D+1", None),
        ("CDB Banco Inter 110% CDI", "Renda fixa", "Banco Inter", 8_000_00, 8_620_00, add_months(today, 4).isoformat(), "No vencimento", None),
        ("BOVA11", "ETF", "XP Investimentos", 5_200_00, 5_470_00, None, "D+2", "BOVA11"),
        ("IVVB11", "ETF", "XP Investimentos", 3_000_00, 3_410_00, None, "D+2", "IVVB11"),
        ("Bitcoin", "Criptoativos", "Binance", 1_500_00, 1_980_00, None, "D+0", "bitcoin"),
    ]
    for asset, cls, inst, cost, cur, mat, liq, ticker in inv_defs:
        inv = ent(Investment, asset=asset, institution=inst, quantity=1, cost=cost, current_value=cur,
                  maturity=mat, liquidity=liq, ticker=ticker,
                  quote_source=("coingecko" if ticker == "bitcoin" else "brapi") if ticker else None,
                  **{"class": cls})
        db.investments.append(inv)
        n = rng.randint(3, 8)
        base, rest = divmod(cost, n)
        for i in range(n):
            ref = add_months(today, -(n - i) * 2)
            d = clamp_day(ref.year, ref.month, rng.randint(5, 25))
            db.contributions.append(ent(Contribution, investment_id=inv.id, date=d.isoformat(),
                                        amount=base + (rest if i == 0 else 0)))

    # --- goals, budgets, rules ------------------------------------------------
    db.goals = [
        ent(Goal, name="Reserva de emergência", target=30_000_00, deadline=add_months(today, 14).isoformat(), color="#24735B"),
        ent(Goal, name="Viagem Europa", target=18_000_00, deadline=add_months(today, 20).isoformat(), color="#9A6A1D"),
    ]
    for t in tx:
        if t.kind == "transfer" and t.to_account_id == savings.id:
            t.goal_id = db.goals[0].id
    budget_defs = [("Alimentação", 2_400_00), ("Transporte", 750_00), ("Lazer", 600_00),
                   ("Compras", 900_00), ("Saúde", 1_000_00), ("Contas", 650_00),
                   ("Assinaturas", 300_00), ("Moradia", 3_600_00), ("Pet", 250_00)]
    db.budgets = [ent(Budget, category_id=cat[c], amount=a) for c, a in budget_defs]
    rule_defs = [("ifood", "Alimentação"), ("uber", "Transporte"), ("posto", "Transporte"),
                 ("drogasil", "Saúde"), ("netflix", "Assinaturas"), ("amazon", "Compras")]
    db.rules = [ent(CategoryRule, pattern=p, category_id=cat[c], priority=10 - i) for i, (p, c) in enumerate(rule_defs)]

    tx.sort(key=lambda t: (t.date, t.description))
    db.transactions = tx
    return db
