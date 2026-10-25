from fastapi.testclient import TestClient

from app.config import settings
from app.rate_limit import RateLimiter


def test_limiter_allows_hits_again_once_the_window_passes() -> None:
    now = [0.0]
    limiter = RateLimiter(limit=2, window=60, clock=lambda: now[0])
    assert limiter.hit("ip") and limiter.hit("ip")
    assert not limiter.hit("ip")
    assert limiter.hit("other-ip")
    now[0] = 61
    assert limiter.hit("ip")


def test_login_returns_429_after_too_many_attempts(client: TestClient) -> None:
    attempt = {"login": "nobody", "password": "wrong-pass"}
    for _ in range(settings.login_attempts_per_minute):
        assert client.post("/auth/login", json=attempt).status_code == 401
    blocked = client.post("/auth/login", json=attempt)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
