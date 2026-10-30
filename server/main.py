import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from server import errors
from server.routers import crud
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

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION}

    for kind in CRUD_COLLECTIONS:
        app.include_router(crud.make_router(kind))
    app.include_router(crud.settings_router())

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
