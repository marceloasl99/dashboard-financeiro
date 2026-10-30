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
