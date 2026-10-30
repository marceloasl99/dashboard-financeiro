import pytest
from fastapi.testclient import TestClient

from server.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(data_dir=tmp_path)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def demo_client(tmp_path):
    from datetime import date

    from server.demo import build_demo

    application = create_app(data_dir=tmp_path)
    application.state.repo.replace_all(build_demo(today=date(2026, 10, 29)))
    with TestClient(application) as c:
        yield c
