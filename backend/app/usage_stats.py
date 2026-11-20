"""Usage statistics pipeline: Smogon's monthly reports into PostgreSQL.

Smogon publishes, every month and for every format, how often each Pokémon is used on
Pokémon Showdown and with which moves, items, abilities and EV spreads. This module runs
the pipeline in three separate steps:

  extract    download the month's "chaos" JSON report (plain or gzipped)
  transform  turn raw weights into shares and keep the most common entries
  load       replace that month's report in the database, in one transaction

Run it with:  python -m app.usage_stats --format gen9vgc2024regg --rating 1630
A scheduled GitHub Actions workflow (.github/workflows/usage-stats.yml) runs it monthly.
"""

import argparse
import gzip
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import UsagePokemon, UsageReport

STATS_URL = "https://www.smogon.com/stats"
# The most common entries kept per list. Spreads have a long tail, so more of them are kept.
KEEP = {"moves": 10, "items": 6, "abilities": 3, "spreads": 10, "tera_types": 6}
# Pokémon kept per report, most used first.
KEEP_POKEMON = 100
# How many months back to look for a format's newest report.
MAX_MONTHS_BACK = 12

# Smogon's chaos report keys for each list, and the keys stored in UsagePokemon.sets.
LISTS = {"Moves": "moves", "Items": "items", "Abilities": "abilities", "Spreads": "spreads"}
# Scarlet/Violet reports also have Tera types; other games' reports don't.
OPTIONAL_LISTS = {"Tera Types": "tera_types"}
# Placeholders in Smogon's lists: an empty move slot, and no Tera type.
EMPTY = {"moves": "", "tera_types": "nothing"}


@dataclass
class PokemonUsage:
    species: str
    rank: int
    usage: float
    sets: dict[str, list[dict[str, Any]]]


@dataclass
class Report:
    battles: int
    pokemon: list[PokemonUsage]


# ---------------------------------------------------------------------------------------------
# Extract


def fetch(url: str) -> bytes | None:
    """The file at `url`, or None when it doesn't exist (404). Other errors are raised."""
    request = urllib.request.Request(url, headers={"User-Agent": "vgc-lab usage pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def published_months() -> list[str]:
    """Every month with published statistics, newest first."""
    listing = fetch(f"{STATS_URL}/")
    if listing is None:
        raise RuntimeError(f"No statistics index at {STATS_URL}/")
    return sorted(set(re.findall(r'href="(\d{4}-\d{2})/"', listing.decode())), reverse=True)


def decode(raw: bytes) -> dict[str, Any]:
    """Parses a chaos report. Smogon has served them both gzipped and plain over the years."""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)


def download_latest(fmt: str, rating: int) -> tuple[str, dict[str, Any]]:
    """The newest month that has a report for the format, and that report."""
    for month in published_months()[:MAX_MONTHS_BACK]:
        raw = fetch(f"{STATS_URL}/{month}/chaos/{fmt}-{rating}.json")
        if raw is not None:
            return month, decode(raw)
    raise RuntimeError(f"No {fmt}-{rating} report in the last {MAX_MONTHS_BACK} months")


# ---------------------------------------------------------------------------------------------
# Transform


def top(weights: dict[str, float], total: float, n: int, skip: str | None) -> list[dict[str, Any]]:
    """The `n` heaviest entries as {"id", "share"} of `total`, most common first."""
    ranked = sorted(((k, w) for k, w in weights.items() if k != skip), key=lambda kw: kw[1], reverse=True)
    return [{"id": k, "share": round(w / total, 4)} for k, w in ranked[:n]]


def transform(chaos: dict[str, Any]) -> Report:
    """Turns a chaos report into usage shares.

    Chaos reports hold weights, not shares: each set counts by its player's rating. Every set
    has exactly one ability, so a Pokémon's ability weights add up to its total weight, which
    turns every other weight into the share of its sets that have that move, item or spread.
    """
    battles = chaos["info"]["number of battles"]
    data: dict[str, dict[str, Any]] = chaos["data"]
    ranked = sorted(data.items(), key=lambda item: item[1]["usage"], reverse=True)[:KEEP_POKEMON]

    pokemon = []
    for rank, (species, entry) in enumerate(ranked, start=1):
        total = sum(entry["Abilities"].values())
        if total <= 0:
            raise ValueError(f"{species} has no ability weights")
        lists = {key: entry[source] for source, key in LISTS.items()}
        lists |= {key: entry[source] for source, key in OPTIONAL_LISTS.items() if source in entry}
        sets = {key: top(weights, total, KEEP[key], EMPTY.get(key)) for key, weights in lists.items()}
        pokemon.append(PokemonUsage(species=species, rank=rank, usage=round(entry["usage"], 6), sets=sets))
    return Report(battles=battles, pokemon=pokemon)


# ---------------------------------------------------------------------------------------------
# Load


def load(db: Session, fmt: str, month: str, rating: int, report: Report) -> UsageReport:
    """Stores the report, replacing any earlier load of the same month, in one transaction.

    Loading the same month twice gives the same result, so the job can be rerun safely.
    """
    with db.begin():
        db.execute(
            delete(UsageReport).where(
                UsageReport.format == fmt, UsageReport.month == month, UsageReport.rating == rating
            )
        )
        row = UsageReport(format=fmt, month=month, rating=rating, battles=report.battles)
        row.pokemon = [
            UsagePokemon(species=p.species, rank=p.rank, usage=p.usage, sets=p.sets) for p in report.pokemon
        ]
        db.add(row)
    return row


# ---------------------------------------------------------------------------------------------
# Command line


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description="Load Smogon usage statistics into the database.")
    parser.add_argument("--format", dest="formats", action="append", required=True, help="e.g. gen9vgc2024regg")
    parser.add_argument("--rating", type=int, default=1630, help="Smogon's rating cutoff: 0, 1500, 1630 or 1760")
    parser.add_argument("--file", help="Load this chaos report instead of downloading it ('-' reads stdin)")
    parser.add_argument("--month", help="YYYY-MM of the report given with --file")
    args = parser.parse_args(argv)
    if args.file and (len(args.formats) != 1 or not args.month):
        parser.error("--file needs exactly one --format and a --month")

    from app.database import SessionLocal

    for fmt in args.formats:
        if args.file:
            month = args.month
            chaos = decode(sys.stdin.buffer.read() if args.file == "-" else open(args.file, "rb").read())
        else:
            month, chaos = download_latest(fmt, args.rating)
        report = transform(chaos)
        with SessionLocal() as db:
            load(db, fmt, month, args.rating, report)
        print(f"Loaded {fmt} {month} (rating {args.rating}): {len(report.pokemon)} Pokémon, {report.battles} battles")


if __name__ == "__main__":
    main(sys.argv[1:])
