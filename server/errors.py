from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

MESSAGES = {
    "missing": "Campo obrigatório.",
    "string_too_short": "Campo obrigatório.",
    "greater_than": "O valor deve ser maior que zero.",
    "greater_than_equal": "O valor não pode ser negativo.",
    "less_than_equal": "Valor acima do permitido.",
    "int_parsing": "Informe um número inteiro.",
    "float_parsing": "Informe um número.",
    "literal_error": "Opção inválida.",
    "json_invalid": "JSON inválido.",
}


class ApiError(Exception):
    def __init__(self, status: int, message: str, field: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.field = field


def error_response(status: int, message: str, field: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message, "field": field})


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return error_response(exc.status, exc.message, exc.field)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errs = exc.errors()
        if not errs:
            return error_response(400, "Dados inválidos.")
        first = errs[0]
        loc = [str(p) for p in first.get("loc", []) if p not in ("body", "query", "path")]
        field = ".".join(loc) or None
        msg = MESSAGES.get(first.get("type", ""), first.get("msg", "Dados inválidos."))
        return error_response(400, msg, field)

    @app.exception_handler(KeyError)
    async def _not_found(_: Request, exc: KeyError):
        return error_response(404, "Registro não encontrado.")
