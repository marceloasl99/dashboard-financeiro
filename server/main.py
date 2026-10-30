import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

VERSION = "2.0.0-beta"
ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"


def default_data_dir() -> Path:
    return Path(os.environ.get("FINANCE_DATA_DIR", ROOT / "data"))


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = Path(data_dir) if data_dir else default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="Finance OS", version=VERSION)
    app.state.data_dir = data_dir

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION}

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
