import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from server import errors
from datetime import date

from server.routers import cards, crud, insights, recurrences, transactions
from server.services.recurrences import materialize
from server.storage.json_repo import JsonRepository

VERSION = "2.0.0-beta"
ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"

CRUD_COLLECTIONS = [
    "accounts", "cards", "categories", "transactions", "recurrences",
    "budgets", "goals", "investments", "contributions", "rules",
]


def default_data_dir() -> Path:
    return Path(os.environ.get("FINANCE_DATA_DIR", ROOT / "data"))


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = Path(data_dir) if data_dir else default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="Finance OS", version=VERSION)
    app.state.data_dir = data_dir
    app.state.repo = JsonRepository(data_dir / "finance.json", data_dir / "backups")
    errors.install(app)
    materialize(app.state.repo, date.today())

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION}

    for kind in CRUD_COLLECTIONS:
        if kind not in ("transactions", "recurrences"):
            app.include_router(crud.make_router(kind))
    app.include_router(transactions.router)
    app.include_router(recurrences.router)
    app.include_router(crud.settings_router())
    app.include_router(cards.router)
    app.include_router(insights.router)

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
