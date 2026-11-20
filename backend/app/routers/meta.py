from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.deps import DB
from app.models import UsagePokemon, UsageReport
from app.schemas import UsagePokemonOut, UsageReportDetail, UsageReportOut

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/reports", response_model=list[UsageReportOut])
def list_reports(db: DB) -> list[UsageReport]:
    """Public: every loaded usage report, newest month first."""
    query = select(UsageReport).order_by(UsageReport.month.desc(), UsageReport.format, UsageReport.rating.desc())
    return list(db.scalars(query))


@router.get("/reports/{report_id}", response_model=UsageReportDetail)
def read_report(report_id: int, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 30) -> UsageReportDetail:
    """Public: a report with its `limit` most used Pokémon and their most common sets."""
    report = db.get(UsageReport, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usage report not found")
    query = select(UsagePokemon).where(UsagePokemon.report_id == report_id).order_by(UsagePokemon.rank).limit(limit)
    pokemon = [UsagePokemonOut.model_validate(p) for p in db.scalars(query)]
    return UsageReportDetail(**UsageReportOut.model_validate(report).model_dump(), pokemon=pokemon)
