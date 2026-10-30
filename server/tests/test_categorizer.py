from server.models import CategoryRule, Transaction
from server.services.categorizer import normalize, suggest


def test_normalize():
    assert normalize("  Alimentação   iFOOD ") == "alimentacao ifood"


def test_rule_wins_over_history():
    rules = [CategoryRule(pattern="ifood", category_id="food", priority=5),
             CategoryRule(pattern="food", category_id="other", priority=1)]
    history = [Transaction(date="2026-01-01", amount=1, account_id="a", category_id="hist", description="IFOOD *RESTAURANTE")]
    assert suggest("IFOOD *Restaurante", rules, history) == "food"


def test_history_suggestion():
    history = [Transaction(date="2026-01-01", amount=1, account_id="a", category_id="fuel", description="Posto Shell Centro"),
               Transaction(date="2026-01-02", amount=1, account_id="a", category_id="food", description="Padaria")]
    assert suggest("POSTO SHELL", [], history) == "fuel"


def test_no_match_none():
    assert suggest("Zzz desconhecido", [], []) is None
