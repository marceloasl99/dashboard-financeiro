"""Full export (JSON/CSV) and restore from a JSON backup."""
import json

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import JSONResponse, Response

from server.deps import get_repo
from server.errors import ApiError
from server.models import Database
from server.services.export import to_csv
from server.storage.base import Repository

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/export.json")
def export_json(repo: Repository = Depends(get_repo)):
    return JSONResponse(repo.snapshot().model_dump(by_alias=True),
                        headers={"Content-Disposition": 'attachment; filename="finance-backup.json"'})


@router.get("/export.csv")
def export_csv(repo: Repository = Depends(get_repo)):
    return Response(to_csv(repo.snapshot()).encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="lancamentos.csv"'})


@router.post("/import/backup")
async def restore(file: UploadFile, repo: Repository = Depends(get_repo)):
    raw = await file.read()
    try:
        db = Database.model_validate(json.loads(raw.decode("utf-8-sig")))
    except (ValueError, UnicodeDecodeError) as e:
        raise ApiError(400, f"Arquivo de backup inválido: {str(e)[:120]}", "file")
    backup = getattr(repo, "backup_today", None)
    if backup:
        backup(suffix="-pre-restore")
    repo.replace_all(db)
    return {"ok": True, "transactions": len(db.transactions)}
