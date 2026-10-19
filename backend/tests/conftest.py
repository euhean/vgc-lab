import os
import tempfile
from collections.abc import Iterator

# Settings are read at import time, so the test configuration must be set first.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["JWT_SECRET"] = "test-secret-with-at-least-32-bytes!!"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c


def register(client: TestClient, username: str = "ash", email: str = "ash@example.com") -> dict[str, str]:
    """Register a user and return the Authorization header for it."""
    client.post("/auth/register", json={"username": username, "email": email, "password": "pikachu123"})
    token = client.post("/auth/login", json={"login": username, "password": "pikachu123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return register(client)
