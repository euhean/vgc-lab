"""The battle simulator: Node.js processes running @pkmn/sim (backend/sim/).

Pokémon Showdown's simulator is a JavaScript library, so battles run in Node and the API talks
to it over pipes, one JSON message per line:
  - Live battles share one long-lived process (sim/live.mjs), started on first use. Its
    messages carry a battle id, and a reader task routes each one to that battle's queue.
  - Win-rate simulations start a short-lived process each (sim/simulate.mjs). They are CPU
    bound, so running them apart keeps live battles responsive; a semaphore limits how many
    run at once.
"""

import asyncio
import json
import math
import secrets
from pathlib import Path
from typing import Any

from app.config import settings

SIM_DIR = Path(__file__).resolve().parent.parent / "sim"


class SimulatorError(RuntimeError):
    pass


class LiveBattles:
    """Routes messages between live battles and the Node process that runs them."""

    def __init__(self) -> None:
        self.process: asyncio.subprocess.Process | None = None
        self.reader: asyncio.Task[None] | None = None
        self.queues: dict[str, asyncio.Queue[dict[str, Any]]] = {}

    async def _process(self) -> asyncio.subprocess.Process:
        if self.process is None or self.process.returncode is not None:
            self.process = await asyncio.create_subprocess_exec(
                "node", "live.mjs", cwd=SIM_DIR, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                limit=2**20,  # a battle chunk with requests can be long
            )
            self.reader = asyncio.create_task(self._read(self.process))
        return self.process

    async def _read(self, process: asyncio.subprocess.Process) -> None:
        assert process.stdout is not None
        async for line in process.stdout:
            message = json.loads(line)
            queue = self.queues.get(message["id"])
            if queue is not None:
                queue.put_nowait(message)
        # The process exited: every battle it ran is over.
        for queue in self.queues.values():
            queue.put_nowait({"type": "error", "message": "The simulator stopped"})
        self.queues.clear()

    async def _send(self, message: dict[str, Any]) -> None:
        process = await self._process()
        assert process.stdin is not None
        process.stdin.write(json.dumps(message).encode() + b"\n")
        await process.stdin.drain()

    async def start(self, p1: str, p2: str) -> tuple[str, asyncio.Queue[dict[str, Any]]]:
        """Starts a battle between two Showdown pastes; you are p1. Returns its id and message queue."""
        if len(self.queues) >= settings.max_live_battles:
            raise SimulatorError("Too many battles are running right now; try again in a minute")
        battle_id = secrets.token_hex(8)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.queues[battle_id] = queue
        await self._send({"id": battle_id, "type": "start", "p1": p1, "p2": p2})
        return battle_id, queue

    async def choose(self, battle_id: str, choice: str) -> None:
        await self._send({"id": battle_id, "type": "choose", "choice": choice})

    async def stop(self, battle_id: str) -> None:
        """Forfeits the battle if it is still running and forgets it."""
        if self.queues.pop(battle_id, None) is not None:
            await self._send({"id": battle_id, "type": "stop"})

    async def shutdown(self) -> None:
        """Stops the process; called when the API shuts down."""
        if self.process is not None and self.process.returncode is None:
            self.process.terminate()
            await self.process.wait()
        if self.reader is not None:
            await self.reader
        self.process = self.reader = None


live_battles = LiveBattles()
_simulations = asyncio.Semaphore(settings.max_simulations)


async def simulate(p1: str, p2: str, games: int) -> dict[str, int]:
    """Plays `games` AI-vs-AI battles and returns {"games", "wins", "losses", "ties"} for p1."""
    async with _simulations:
        process = await asyncio.create_subprocess_exec(
            "node", "simulate.mjs", cwd=SIM_DIR,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        request = json.dumps({"p1": p1, "p2": p2, "games": games}).encode()
        try:
            out, err = await asyncio.wait_for(process.communicate(request), settings.simulation_timeout_seconds)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise SimulatorError("The simulation took too long; try fewer games")
    if process.returncode != 0:
        raise SimulatorError(f"The simulator failed: {err.decode().strip().splitlines()[-1]}")
    return json.loads(out)


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float, float]:
    """95% confidence interval of a proportion (Wilson score), sound even near 0% or 100%."""
    p = successes / trials
    centre = (p + z * z / (2 * trials)) / (1 + z * z / trials)
    margin = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / (1 + z * z / trials)
    return max(0.0, centre - margin), min(1.0, centre + margin)
