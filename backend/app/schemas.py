from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    login: str = Field(description="Username or email")
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    format: str = Field(default="gen9vgc", max_length=32)
    paste: str = Field(default="", max_length=20_000)


class TeamOut(TeamIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    share_id: str | None
    updated_at: datetime


class SharedTeamOut(BaseModel):
    """What anyone with a share link can see: no ids or emails."""

    name: str
    format: str
    paste: str
    owner: str
    updated_at: datetime


class UsageReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    format: str
    month: str = Field(description="YYYY-MM")
    rating: int = Field(description="Smogon's rating cutoff")
    battles: int
    loaded_at: datetime


class UsageEntry(BaseModel):
    id: str = Field(description="Showdown id, e.g. 'sitrusberry', or a spread 'Careful:252/4/0/0/252/0'")
    share: float = Field(description="Share of this Pokémon's sets that have it (0-1)")


class UsagePokemonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int
    species: str
    usage: float = Field(description="Share of teams that use it (0-1)")
    sets: dict[str, list[UsageEntry]] = Field(
        description="Most common moves, items, abilities, spreads and Tera types, most common first"
    )


class UsageReportDetail(UsageReportOut):
    pokemon: list[UsagePokemonOut]
