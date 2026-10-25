import secrets

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.deps import DB, CurrentUser
from app.models import Team
from app.schemas import TeamIn, TeamOut

router = APIRouter(prefix="/teams", tags=["teams"])


def get_own_team(db: DB, user: CurrentUser, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None or team.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return team


@router.get("", response_model=list[TeamOut])
def list_teams(db: DB, user: CurrentUser) -> list[Team]:
    return list(db.scalars(select(Team).where(Team.owner_id == user.id).order_by(Team.updated_at.desc())))


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def create_team(data: TeamIn, db: DB, user: CurrentUser) -> Team:
    team = Team(owner_id=user.id, **data.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamOut)
def read_team(team_id: int, db: DB, user: CurrentUser) -> Team:
    return get_own_team(db, user, team_id)


@router.put("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, data: TeamIn, db: DB, user: CurrentUser) -> Team:
    team = get_own_team(db, user, team_id)
    for field, value in data.model_dump().items():
        setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(team_id: int, db: DB, user: CurrentUser) -> Response:
    db.delete(get_own_team(db, user, team_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{team_id}/share", response_model=TeamOut)
def share_team(team_id: int, db: DB, user: CurrentUser) -> Team:
    """Gives the team a public read-only link. Sharing an already shared team keeps its link."""
    team = get_own_team(db, user, team_id)
    if team.share_id is None:
        team.share_id = secrets.token_urlsafe(8)
        db.commit()
        db.refresh(team)
    return team


@router.delete("/{team_id}/share", response_model=TeamOut)
def unshare_team(team_id: int, db: DB, user: CurrentUser) -> Team:
    """Removes the public link; the old link stops working."""
    team = get_own_team(db, user, team_id)
    team.share_id = None
    db.commit()
    db.refresh(team)
    return team
