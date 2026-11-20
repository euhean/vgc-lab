from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, battles, meta, shared, teams
from app.simulator import live_battles


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await live_battles.shutdown()


# The schema is managed by Alembic migrations (`alembic upgrade head`), not created at startup.
app = FastAPI(title="VGC Lab API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(shared.router)
app.include_router(meta.router)
app.include_router(battles.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
