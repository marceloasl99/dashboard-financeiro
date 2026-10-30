"""Computed views: dashboard, forecast, calendar, reports."""
from datetime import date

from fastapi import APIRouter, Depends, Query

from server.deps import get_repo
from server.errors import ApiError
from server.services import calendar, dashboard, forecast, reports
from server.storage.base import Repository

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/dashboard")
def get_dashboard(year: int | None = None, month: int | None = Query(None, ge=1, le=12),
                  repo: Repository = Depends(get_repo)):
    today = date.today()
    return dashboard.build(repo, year or today.year, month or today.month, today)


@router.get("/forecast")
def get_forecast(days: int = Query(90, ge=7, le=365), repo: Repository = Depends(get_repo)):
    return forecast.build(repo, date.today(), days)


@router.get("/calendar")
def get_calendar(year: int, month: int = Query(..., ge=1, le=12), repo: Repository = Depends(get_repo)):
    return calendar.build(repo, year, month, date.today())


@router.get("/reports/annual")
def annual(year: int, repo: Repository = Depends(get_repo)):
    return reports.annual(repo, year)


@router.get("/reports/compare")
def compare(year_a: int, year_b: int, repo: Repository = Depends(get_repo)):
    return reports.compare(repo, year_a, year_b)


@router.get("/reports/category/{id}")
def category(id: str, months: int = Query(24, ge=3, le=60), repo: Repository = Depends(get_repo)):
    if repo.get("categories", id) is None:
        raise ApiError(404, "Categoria não encontrada.")
    return reports.category_series(repo, id, months, date.today())
