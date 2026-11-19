import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    """Allows at most `limit` recorded events per key within a sliding window of `window` seconds.

    State is kept in memory, which fits a single API instance. Several instances
    would need a shared store such as Redis.
    """

    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self.clock = clock
        self.events: dict[str, deque[float]] = {}

    def _recent(self, key: str) -> deque[float]:
        events = self.events.setdefault(key, deque())
        while events and events[0] <= self.clock() - self.window:
            events.popleft()
        return events

    def blocked(self, key: str) -> bool:
        """Whether this key has reached the limit, without recording anything."""
        return len(self._recent(key)) >= self.limit

    def record(self, key: str) -> None:
        self._recent(key).append(self.clock())

    def retry_after(self, key: str) -> int:
        """Seconds until the oldest event for this key leaves the window."""
        return max(1, int(self.events[key][0] + self.window - self.clock()) + 1)

    def clear(self) -> None:
        self.events.clear()
