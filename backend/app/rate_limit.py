import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    """Allows at most `limit` hits per key within a sliding window of `window` seconds.

    State is kept in memory, which fits a single API instance. Several instances
    would need a shared store such as Redis.
    """

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self.clock = clock
        self.hits: dict[str, deque[float]] = {}

    def hit(self, key: str) -> bool:
        """Records a hit and returns whether it is within the limit."""
        now = self.clock()
        hits = self.hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def retry_after(self, key: str) -> int:
        """Seconds until the oldest hit for this key leaves the window."""
        return max(1, int(self.hits[key][0] + self.window - self.clock()) + 1)

    def clear(self) -> None:
        self.hits.clear()
