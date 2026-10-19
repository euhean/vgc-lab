from fastapi.testclient import TestClient

from tests.conftest import register

USER = {"username": "misty", "email": "misty@example.com", "password": "starmie123"}


def test_register_returns_user_without_password(client: TestClient) -> None:
    res = client.post("/auth/register", json=USER)
    assert res.status_code == 201
    assert res.json() == {"id": 1, "username": "misty", "email": "misty@example.com"}


def test_register_rejects_duplicate_username_or_email(client: TestClient) -> None:
    client.post("/auth/register", json=USER)
    assert client.post("/auth/register", json={**USER, "email": "other@example.com"}).status_code == 409
    assert client.post("/auth/register", json={**USER, "username": "other"}).status_code == 409


def test_register_validates_input(client: TestClient) -> None:
    assert client.post("/auth/register", json={**USER, "email": "not-an-email"}).status_code == 422
    assert client.post("/auth/register", json={**USER, "password": "short"}).status_code == 422


def test_login_with_username_or_email(client: TestClient) -> None:
    client.post("/auth/register", json=USER)
    for login in ("misty", "misty@example.com"):
        res = client.post("/auth/login", json={"login": login, "password": "starmie123"})
        assert res.status_code == 200
        assert res.json()["token_type"] == "bearer"


def test_login_rejects_wrong_password(client: TestClient) -> None:
    client.post("/auth/register", json=USER)
    assert client.post("/auth/login", json={"login": "misty", "password": "wrong-pass"}).status_code == 401


def test_me_requires_valid_token(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    headers = register(client)
    assert client.get("/auth/me", headers=headers).json()["username"] == "ash"
