from fastapi.testclient import TestClient

from tests.conftest import register

PASTE = """Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
Tera Type: Ghost
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot"""


def test_team_crud_round_trip(client: TestClient, auth: dict[str, str]) -> None:
    created = client.post("/teams", json={"name": "Rain", "paste": PASTE}, headers=auth)
    assert created.status_code == 201
    team = created.json()
    assert team["format"] == "gen9vgc"

    # The paste is stored and returned exactly as it was sent.
    assert client.get(f"/teams/{team['id']}", headers=auth).json()["paste"] == PASTE

    updated = client.put(f"/teams/{team['id']}", json={"name": "Sun", "paste": ""}, headers=auth)
    assert updated.json()["name"] == "Sun"

    assert [t["name"] for t in client.get("/teams", headers=auth).json()] == ["Sun"]

    assert client.delete(f"/teams/{team['id']}", headers=auth).status_code == 204
    assert client.get(f"/teams/{team['id']}", headers=auth).status_code == 404


def test_teams_are_private_to_their_owner(client: TestClient, auth: dict[str, str]) -> None:
    team_id = client.post("/teams", json={"name": "Mine"}, headers=auth).json()["id"]
    other = register(client, "gary", "gary@example.com")

    assert client.get("/teams", headers=other).json() == []
    assert client.get(f"/teams/{team_id}", headers=other).status_code == 404
    assert client.put(f"/teams/{team_id}", json={"name": "Stolen"}, headers=other).status_code == 404
    assert client.delete(f"/teams/{team_id}", headers=other).status_code == 404


def test_teams_require_auth(client: TestClient) -> None:
    assert client.get("/teams").status_code == 401
