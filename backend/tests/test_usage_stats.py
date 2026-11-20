import gzip
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import usage_stats
from app.database import SessionLocal
from app.models import UsagePokemon, UsageReport

FIXTURE = Path(__file__).parent / "fixtures" / "chaos-gen9vgc2024regg-1630.json"


def chaos() -> dict:
    return json.loads(FIXTURE.read_text())


def test_transform_turns_weights_into_shares_of_each_pokemons_sets() -> None:
    report = usage_stats.transform(chaos())
    assert report.battles == 52341
    assert [p.species for p in report.pokemon[:3]] == ["Incineroar", "Flutter Mane", "Rillaboom"]
    assert [p.rank for p in report.pokemon[:3]] == [1, 2, 3]

    incineroar = report.pokemon[0]
    assert incineroar.sets["moves"][0] == {"id": "fakeout", "share": 0.97}
    assert incineroar.sets["spreads"][0] == {"id": "Careful:252/4/0/0/252/0", "share": 0.3}
    # Empty move slots and "no Tera type" are placeholders, not choices.
    assert "" not in [m["id"] for m in incineroar.sets["moves"]]
    assert "nothing" not in [t["id"] for t in incineroar.sets["tera_types"]]
    assert len(incineroar.sets["moves"]) <= usage_stats.KEEP["moves"]


def test_transform_fails_on_a_report_without_the_expected_lists() -> None:
    broken = chaos()
    del broken["data"]["Incineroar"]["Moves"]
    with pytest.raises(KeyError):
        usage_stats.transform(broken)


def test_decode_reads_plain_and_gzipped_reports() -> None:
    raw = FIXTURE.read_bytes()
    assert usage_stats.decode(raw) == usage_stats.decode(gzip.compress(raw))


def test_download_latest_falls_back_to_the_newest_month_with_the_format(monkeypatch: pytest.MonkeyPatch) -> None:
    listing = b'<a href="2026-09/">2026-09/</a> <a href="2026-10/">2026-10/</a> <a href="2026-08/">2026-08/</a>'
    files = {
        f"{usage_stats.STATS_URL}/": listing,
        f"{usage_stats.STATS_URL}/2026-09/chaos/gen9vgc2024regg-1630.json": FIXTURE.read_bytes(),
    }
    requested = []

    def fake_fetch(url: str) -> bytes | None:
        requested.append(url)
        return files.get(url)

    monkeypatch.setattr(usage_stats, "fetch", fake_fetch)
    month, report = usage_stats.download_latest("gen9vgc2024regg", 1630)
    assert month == "2026-09"
    assert report["info"]["number of battles"] == 52341
    # Newest first: October has no report for the format, so September is used.
    assert requested[1:] == [
        f"{usage_stats.STATS_URL}/2026-10/chaos/gen9vgc2024regg-1630.json",
        f"{usage_stats.STATS_URL}/2026-09/chaos/gen9vgc2024regg-1630.json",
    ]


def test_loading_the_same_month_twice_replaces_it(client: TestClient) -> None:
    report = usage_stats.transform(chaos())
    with SessionLocal() as db:
        usage_stats.load(db, "gen9vgc2024regg", "2026-10", 1630, report)
        usage_stats.load(db, "gen9vgc2024regg", "2026-10", 1630, report)
        usage_stats.load(db, "gen9vgc2024regg", "2026-09", 1630, report)
        assert db.scalar(select(func.count()).select_from(UsageReport)) == 2
        assert db.scalar(select(func.count()).select_from(UsagePokemon)) == 2 * len(report.pokemon)


def test_command_line_loads_a_report_file(client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    usage_stats.main(["--format", "gen9vgc2024regg", "--file", str(FIXTURE), "--month", "2026-10"])
    assert "Loaded gen9vgc2024regg 2026-10 (rating 1630): 8 Pokémon" in capsys.readouterr().out


def test_meta_endpoints_serve_the_newest_reports(client: TestClient) -> None:
    report = usage_stats.transform(chaos())
    with SessionLocal() as db:
        usage_stats.load(db, "gen9vgc2024regg", "2026-09", 1630, report)
        usage_stats.load(db, "gen9vgc2024regg", "2026-10", 1630, report)

    reports = client.get("/meta/reports").json()
    assert [r["month"] for r in reports] == ["2026-10", "2026-09"]

    detail = client.get(f"/meta/reports/{reports[0]['id']}", params={"limit": 3}).json()
    assert detail["battles"] == 52341
    assert [p["species"] for p in detail["pokemon"]] == ["Incineroar", "Flutter Mane", "Rillaboom"]
    assert detail["pokemon"][0]["sets"]["items"][0] == {"id": "sitrusberry", "share": 0.45}

    assert client.get("/meta/reports/999").status_code == 404
