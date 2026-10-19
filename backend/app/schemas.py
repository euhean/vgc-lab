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
    token_type: str = "bearer"


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    format: str = Field(default="gen9vgc", max_length=32)
    paste: str = Field(default="", max_length=20_000)


class TeamOut(TeamIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    updated_at: datetime
