import asyncio
import json
from typing import Any

import jwt
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.deps import DB, CurrentUser
from app.models import Team, User
from app.schemas import SimulationIn, SimulationOut
from app.security import decode_access_token
from app.simulator import SimulatorError, live_battles, simulate, wilson_interval

router = APIRouter(prefix="/battles", tags=["battles"])


def own_paste(db: Session, user: User, team_id: int) -> str:
    """The paste of one of the user's teams, which must have at least one Pokémon."""
    team = db.get(Team, team_id)
    if team is None or team.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    if not team.paste.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{team.name} has no Pokémon")
    return team.paste


@router.post("/simulate", response_model=SimulationOut)
async def simulate_games(data: SimulationIn, db: DB, user: CurrentUser) -> SimulationOut:
    """Monte Carlo win rate: plays `games` battles between two of your teams, with an AI on each side."""
    p1 = own_paste(db, user, data.team_id)
    p2 = own_paste(db, user, data.opponent_team_id)
    try:
        result = await simulate(p1, p2, data.games)
    except SimulatorError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error))
    low, high = wilson_interval(result["wins"], result["games"])
    return SimulationOut(**result, win_rate=result["wins"] / result["games"], win_rate_low=low, win_rate_high=high)


# Close codes for the live battle WebSocket (4000-4999 are free for applications).
UNAUTHORIZED, NOT_FOUND, BAD_REQUEST, BUSY = 4401, 4404, 4400, 4503


@router.websocket("/live")
async def live_battle(websocket: WebSocket) -> None:
    """A battle against the AI.

    Browsers can't send headers when opening a WebSocket, so the first message authenticates:
      → {"token": access_token, "team_id": 1, "opponent_team_id": 2}
    Then the server relays the simulator, from your side (p1):
      ← {"type": "chunk", "data": "..."}    battle log and |request| lines, Showdown protocol
      ← {"type": "end", "winner": "p1" | "p2" | null}
      ← {"type": "error", "message": "..."}
      → {"type": "choose", "choice": "move 1 2, move 3"}
    Closing the connection forfeits the battle.
    """
    await websocket.accept()
    try:
        first = await websocket.receive_json()
        user_id = decode_access_token(first["token"])
        with SessionLocal() as db:
            user = db.get(User, user_id)
            if user is None:
                raise jwt.InvalidTokenError("Unknown user")
            p1 = own_paste(db, user, int(first["team_id"]))
            p2 = own_paste(db, user, int(first["opponent_team_id"]))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError, json.JSONDecodeError) as error:
        code = UNAUTHORIZED if isinstance(error, jwt.PyJWTError) else BAD_REQUEST
        await websocket.close(code, "Invalid token" if code == UNAUTHORIZED else "Invalid first message")
        return
    except HTTPException as error:
        await websocket.close(NOT_FOUND if error.status_code == 404 else BAD_REQUEST, str(error.detail))
        return
    except WebSocketDisconnect:
        return

    try:
        battle_id, queue = await live_battles.start(p1, p2)
    except SimulatorError as error:
        await websocket.close(BUSY, str(error))
        return

    async def to_client() -> None:
        while True:
            message: dict[str, Any] = await queue.get()
            message.pop("id", None)
            await websocket.send_json(message)
            if message["type"] in ("end", "error"):
                return

    async def from_client() -> None:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "choose" and isinstance(message.get("choice"), str):
                await live_battles.choose(battle_id, message["choice"])

    sender = asyncio.create_task(to_client())
    receiver = asyncio.create_task(from_client())
    try:
        done, _ = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        sender.cancel()
        receiver.cancel()
        await live_battles.stop(battle_id)
    if receiver in done and isinstance(receiver.exception(), WebSocketDisconnect):
        return  # the player left: the battle was forfeited
    for task in done:
        task.result()  # raise anything unexpected
    await websocket.close()
