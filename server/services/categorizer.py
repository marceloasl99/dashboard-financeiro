"""Category suggestion: explicit rules first, then similarity with past descriptions."""
from __future__ import annotations

import re
import unicodedata

from server.models import CategoryRule, Transaction

MIN_SIMILARITY = 0.5
NOISE = {"de", "da", "do", "e", "the", "ltda", "sa", "me", "com", "br", "pagamento", "compra"}


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]{2,}", normalize(s)) if t not in NOISE and not t.isdigit()}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def suggest(description: str, rules: list[CategoryRule], history: list[Transaction]) -> str | None:
    text = normalize(description)
    if not text:
        return None
    for rule in sorted(rules, key=lambda r: -r.priority):
        if normalize(rule.pattern) in text:
            return rule.category_id
    toks = tokens(description)
    best, best_score = None, 0.0
    for t in reversed(history):
        if not t.category_id or not t.description:
            continue
        score = jaccard(toks, tokens(t.description))
        if score > best_score:
            best, best_score = t.category_id, score
    return best if best_score >= MIN_SIMILARITY else None
