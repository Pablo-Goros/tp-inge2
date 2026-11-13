"""Normalización de claves de unicidad (docs/contracts.md §3)."""


def normalize_email(s: str) -> str:
    return s.strip().lower()


def course_key(name: str) -> str:
    return " ".join(name.split()).casefold()
