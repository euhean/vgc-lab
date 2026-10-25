from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DB
from app.models import Team
from app.schemas import SharedTeamOut

router = APIRouter(prefix="/shared", tags=["shared"])


@router.get("/{share_id}", response_model=SharedTeamOut)
def read_shared_team(share_id: str, db: DB) -> SharedTeamOut:
    """Public, no login needed: the team behind a share link."""
    team = db.scalar(select(Team).where(Team.share_id == share_id))
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shared team not found")
    return SharedTeamOut(
        name=team.name, format=team.format, paste=team.paste, owner=team.owner.username, updated_at=team.updated_at,
    )
