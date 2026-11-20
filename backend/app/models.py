from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Dialect, Float, ForeignKey, Integer, String, Text, TypeDecorator, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator[datetime]):
    """A timezone-aware UTC datetime on every database.

    PostgreSQL keeps the timezone, but SQLite (used by the tests) returns naive datetimes,
    which can't be compared with aware ones. Values always come back as aware UTC.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    teams: Mapped[list["Team"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    format: Mapped[str] = mapped_column(String(32), default="gen9vgc")
    # The team is stored in Pokémon Showdown's import/export text format.
    paste: Mapped[str] = mapped_column(Text, default="")
    # Random public id for read-only share links; None while the team isn't shared.
    share_id: Mapped[str | None] = mapped_column(String(16), unique=True, index=True, default=None)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="teams")


class RefreshToken(Base):
    """A long-lived token that can be exchanged for a new access token.

    Only a SHA-256 hash is stored, so a database leak doesn't expose usable tokens.
    Each token is single-use: refreshing revokes it and issues a new one (rotation).
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class UsageReport(Base):
    """One month of Smogon usage statistics for a format, at one rating cutoff.

    Loaded by the usage pipeline (app/usage_stats.py). Reloading a month replaces its report.
    """

    __tablename__ = "usage_reports"
    __table_args__ = (UniqueConstraint("format", "month", "rating"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    format: Mapped[str] = mapped_column(String(64), index=True)
    # "YYYY-MM", the month of battles the statistics cover.
    month: Mapped[str] = mapped_column(String(7))
    # Smogon's rating cutoff: only battles from players above it are counted (weighted).
    rating: Mapped[int] = mapped_column(Integer)
    battles: Mapped[int] = mapped_column(Integer)
    loaded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    pokemon: Mapped[list["UsagePokemon"]] = relationship(
        back_populates="report", cascade="all, delete-orphan", order_by="UsagePokemon.rank"
    )


class UsagePokemon(Base):
    """A Pokémon's usage in a report, with its most common moves, items, abilities and spreads."""

    __tablename__ = "usage_pokemon"
    __table_args__ = (UniqueConstraint("report_id", "species"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("usage_reports.id", ondelete="CASCADE"), index=True)
    rank: Mapped[int] = mapped_column(Integer)
    species: Mapped[str] = mapped_column(String(64))
    # Share of teams that use it, weighted by rating (0-1).
    usage: Mapped[float] = mapped_column(Float)
    # Lists of {"id", "share"} entries, most common first, e.g. {"moves": [{"id": "fakeout", "share": 0.98}, ...]}.
    # Shares are of this Pokémon's sets; spreads are "Nature:HP/Atk/Def/SpA/SpD/Spe".
    sets: Mapped[dict[str, Any]] = mapped_column(JSON)

    report: Mapped[UsageReport] = relationship(back_populates="pokemon")
