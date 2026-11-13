"""Escribe frontend/openapi.json desde la app FastAPI. Uso: python scripts/export_openapi.py"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.api.main import create_app  # noqa: E402

out = ROOT / "frontend" / "openapi.json"
out.write_text(json.dumps(create_app().openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"escrito {out}")
