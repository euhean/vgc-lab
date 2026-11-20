"""Battle endpoints. These run the real Node simulator (backend/sim, after `npm ci` there)."""

import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.simulator import wilson_interval

CORE = """Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Protect

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Dazzling Gleam
- Protect"""

WEAK = """Pikachu
Ability: Static
Level: 50
- Thunder Shock

Raichu
Ability: Static
Level: 50
- Thunder Shock"""


def teams(client: TestClient, auth: dict[str, str]) -> tuple[int, int]:
    mine = client.post("/teams", json={"name": "Core", "paste": CORE}, headers=auth).json()["id"]
    theirs = client.post("/teams", json={"name": "Weak", "paste": WEAK}, headers=auth).json()["id"]
    return mine, theirs


def test_wilson_interval_stays_within_0_and_1() -> None:
    low, high = wilson_interval(10, 10)
    assert 0.69 < low < 0.73 and high == 1.0
    low, high = wilson_interval(50, 100)
    assert low == pytest.approx(0.404, abs=0.001) and high == pytest.approx(0.596, abs=0.001)


def test_simulate_plays_ai_battles_and_reports_a_confidence_interval(client: TestClient, auth: dict[str, str]) -> None:
    mine, theirs = teams(client, auth)
    response = client.post("/battles/simulate", json={"team_id": mine, "opponent_team_id": theirs, "games": 10}, headers=auth)
    assert response.status_code == 200
    result = response.json()
    assert result["games"] == 10
    assert result["wins"] + result["losses"] + result["ties"] == 10
    assert result["win_rate"] >= 0.9
    assert result["win_rate_low"] <= result["win_rate"] <= result["win_rate_high"]


def test_simulate_only_uses_your_own_non_empty_teams(client: TestClient, auth: dict[str, str]) -> None:
    mine, theirs = teams(client, auth)
    empty = client.post("/teams", json={"name": "Empty"}, headers=auth).json()["id"]
    body = {"team_id": mine, "opponent_team_id": empty, "games": 1}
    assert client.post("/battles/simulate", json=body, headers=auth).status_code == 400
    body = {"team_id": mine, "opponent_team_id": 999, "games": 1}
    assert client.post("/battles/simulate", json=body, headers=auth).status_code == 404
    body = {"team_id": mine, "opponent_team_id": theirs, "games": 501}
    assert client.post("/battles/simulate", json=body, headers=auth).status_code == 422


def receive_until(ws, predicate):  # type: ignore[no-untyped-def]
    while True:
        message = ws.receive_json()
        if predicate(message):
            return message


def is_request(message: dict) -> bool:
    return message["type"] == "chunk" and message["data"].startswith("|request|")


def test_live_battle_against_the_ai(client: TestClient, auth: dict[str, str]) -> None:
    mine, theirs = teams(client, auth)
    token = auth["Authorization"].removeprefix("Bearer ")
    with client.websocket_connect("/battles/live") as ws:
        ws.send_json({"token": token, "team_id": mine, "opponent_team_id": theirs})
        preview = json.loads(receive_until(ws, is_request)["data"].removeprefix("|request|"))
        assert preview["teamPreview"] is True

        ws.send_json({"type": "choose", "choice": "team 12"})
        # Keep using the first move on the first target until the battle ends.
        while True:
            message = receive_until(ws, lambda m: is_request(m) or m["type"] in ("end", "error"))
            if message["type"] != "chunk":
                break
            request = json.loads(message["data"].removeprefix("|request|"))
            if request.get("wait"):
                continue
            if request.get("forceSwitch"):
                ws.send_json({"type": "choose", "choice": "default"})
                continue
            moves = ["pass" if p["condition"].endswith(" fnt") else "move 1 1" for p in request["side"]["pokemon"][:2]]
            ws.send_json({"type": "choose", "choice": ", ".join(moves)})
        assert message == {"type": "end", "winner": "p1"}


def test_live_battle_needs_a_valid_token(client: TestClient, auth: dict[str, str]) -> None:
    mine, theirs = teams(client, auth)
    with client.websocket_connect("/battles/live") as ws:
        ws.send_json({"token": "not-a-token", "team_id": mine, "opponent_team_id": theirs})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401
