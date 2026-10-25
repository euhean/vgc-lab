from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.database import SessionLocal
from app.models import RefreshToken, utcnow
from app.security import create_access_token

USER = {"username": "brock", "email": "brock@example.com", "password": "onix12345"}


def login(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json=USER)
    return client.post("/auth/login", json={"login": "brock", "password": "onix12345"}).json()


def test_login_returns_an_access_and_a_refresh_token(client: TestClient) -> None:
    tokens = login(client)
    assert tokens["access_token"] and tokens["refresh_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).status_code == 200


def test_expired_access_tokens_are_rejected(client: TestClient) -> None:
    login(client)
    expired = create_access_token(1, lifetime=timedelta(seconds=-1))
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_refresh_rotates_the_refresh_token(client: TestClient) -> None:
    old = login(client)["refresh_token"]
    new = client.post("/auth/refresh", json={"refresh_token": old})
    assert new.status_code == 200
    assert new.json()["refresh_token"] != old
    # The old token is single-use.
    assert client.post("/auth/refresh", json={"refresh_token": old}).status_code == 401


def test_reusing_a_refresh_token_revokes_every_session(client: TestClient) -> None:
    old = login(client)["refresh_token"]
    new = client.post("/auth/refresh", json={"refresh_token": old}).json()["refresh_token"]
    client.post("/auth/refresh", json={"refresh_token": old})  # reuse: looks like a stolen token
    assert client.post("/auth/refresh", json={"refresh_token": new}).status_code == 401


def test_expired_refresh_tokens_are_rejected(client: TestClient) -> None:
    token = login(client)["refresh_token"]
    with SessionLocal() as db:
        db.execute(update(RefreshToken).values(expires_at=utcnow() - timedelta(seconds=1)))
        db.commit()
    assert client.post("/auth/refresh", json={"refresh_token": token}).status_code == 401


def test_logout_revokes_the_refresh_token(client: TestClient) -> None:
    token = login(client)["refresh_token"]
    assert client.post("/auth/logout", json={"refresh_token": token}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": token}).status_code == 401


def test_unknown_refresh_tokens_are_rejected(client: TestClient) -> None:
    assert client.post("/auth/refresh", json={"refresh_token": "made-up"}).status_code == 401
