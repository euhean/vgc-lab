from fastapi.testclient import TestClient

from tests.conftest import register


def create_team(client: TestClient, auth: dict[str, str]) -> int:
    team = client.post("/teams", json={"name": "Rain", "paste": "Pelipper @ Damp Rock\nAbility: Drizzle"}, headers=auth)
    return team.json()["id"]


def test_teams_start_unshared(client: TestClient, auth: dict[str, str]) -> None:
    team_id = create_team(client, auth)
    assert client.get(f"/teams/{team_id}", headers=auth).json()["share_id"] is None


def test_shared_team_is_public_and_read_only(client: TestClient, auth: dict[str, str]) -> None:
    team_id = create_team(client, auth)
    share_id = client.post(f"/teams/{team_id}/share", headers=auth).json()["share_id"]

    shared = client.get(f"/shared/{share_id}")  # no Authorization header
    assert shared.status_code == 200
    assert shared.json()["name"] == "Rain"
    assert shared.json()["owner"] == "ash"
    assert "id" not in shared.json() and "email" not in shared.json()


def test_sharing_twice_keeps_the_same_link(client: TestClient, auth: dict[str, str]) -> None:
    team_id = create_team(client, auth)
    first = client.post(f"/teams/{team_id}/share", headers=auth).json()["share_id"]
    assert client.post(f"/teams/{team_id}/share", headers=auth).json()["share_id"] == first


def test_unsharing_disables_the_link(client: TestClient, auth: dict[str, str]) -> None:
    team_id = create_team(client, auth)
    share_id = client.post(f"/teams/{team_id}/share", headers=auth).json()["share_id"]
    assert client.delete(f"/teams/{team_id}/share", headers=auth).json()["share_id"] is None
    assert client.get(f"/shared/{share_id}").status_code == 404


def test_only_the_owner_can_share(client: TestClient, auth: dict[str, str]) -> None:
    team_id = create_team(client, auth)
    other = register(client, "gary", "gary@example.com")
    assert client.post(f"/teams/{team_id}/share", headers=other).status_code == 404
    assert client.delete(f"/teams/{team_id}/share", headers=other).status_code == 404


def test_unknown_share_links_return_404(client: TestClient) -> None:
    assert client.get("/shared/does-not-exist").status_code == 404
