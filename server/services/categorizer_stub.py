"""Text normalization shared by search and categorization (full categorizer lands in Task 9)."""
import re
import unicodedata


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()
