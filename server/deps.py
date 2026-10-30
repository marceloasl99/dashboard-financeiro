from fastapi import Request

from server.storage.base import Repository


def get_repo(request: Request) -> Repository:
    return request.app.state.repo
