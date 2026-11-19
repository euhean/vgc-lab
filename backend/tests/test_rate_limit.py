from fastapi.testclient import TestClient

from app.config import settings
from app.rate_limit import RateLimiter
from tests.conftest import register


def test_limiter_blocks_until_the_window_passes() -> None:
    now = [0.0]
    limiter = RateLimiter(limit=2, window=60, clock=lambda: now[0])
    limiter.record("ip")
    assert not limiter.blocked("ip")
    limiter.record("ip")
    assert limiter.blocked("ip")
    assert not limiter.blocked("other-ip")
    now[0] = 61
    assert not limiter.blocked("ip")


def test_login_returns_429_after_too_many_failed_attempts(client: TestClient) -> None:
    attempt = {"login": "nobody", "password": "wrong-pass"}
    for _ in range(settings.failed_logins_per_minute):
        assert client.post("/auth/login", json=attempt).status_code == 401
    blocked = client.post("/auth/login", json=attempt)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_successful_logins_do_not_count_towards_the_limit(client: TestClient) -> None:
    register(client)
    for _ in range(settings.failed_logins_per_minute + 5):
        assert client.post("/auth/login", json={"login": "ash", "password": "pikachu123"}).status_code == 200
