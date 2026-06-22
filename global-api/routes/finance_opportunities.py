"""GET /api/v1/climate-finance/opportunities — Chile climate-finance supply catalogue.

Lists funding opportunities from modelled.finance_opportunity for a country, with optional
filters (sector, eligible actor, status). Resolves the latest catalogued release of the
cl-city-action-fundability dataset. National/regional supply -- not city-specific; the
feasibility endpoint links here scoped to an action's sector.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

DATASOURCE_NAME = "cl-city-action-fundability"


def _normalize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _normalize_value(v) for k, v in value.items()}
    return value


def _resolve_release(session, release_id: Optional[UUID]) -> Optional[Dict[str, Any]]:
    if release_id is not None:
        query = text(
            """
            SELECT dr.release_id, dr.version_label, dr.released_at, dr.source_url
            FROM modelled.dataset_release dr
            WHERE dr.release_id = :release_id
            """
        )
        return session.execute(query, {"release_id": str(release_id)}).mappings().first()

    query = text(
        """
        SELECT dr.release_id, dr.version_label, dr.released_at, dr.source_url
        FROM modelled.dataset_release dr
        JOIN modelled.publisher_datasource pd
          ON pd.publisher_id = dr.publisher_id
         AND pd.dataset_id = dr.dataset_id
        WHERE pd.datasource_name = :datasource_name
          AND dr.is_latest = true
        ORDER BY dr.retrieved_at DESC NULLS LAST
        LIMIT 1
        """
    )
    return session.execute(query, {"datasource_name": DATASOURCE_NAME}).mappings().first()


def _row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    keys = [
        "source_opportunity_id", "opportunity_name", "program_family", "funder_name",
        "funder_level", "funder_channel", "provider", "instrument", "gpc_sectors",
        "thematic_lines", "eligible_actor", "eligible_actor_detail", "city_application",
        "funding_channel", "access_tier", "access_pathway", "open_date", "close_date",
        "status", "lifecycle", "status_as_of", "recurrence", "next_call_estimate",
        "amount_clp", "amount_note", "climate_relevance", "specificity", "source_url",
        "resolucion_url", "detail_level", "data_quality_flags", "source_extras", "notes",
        "country_code", "source_dataset",
    ]
    out = {"opportunity_id": str(row["opportunity_id"])}
    out.update({k: _normalize_value(row[k]) for k in keys})
    return out


def db_finance_opportunities(country_code, sector, eligible_actor, status, limit, offset):
    with SessionLocal() as session:
        release = _resolve_release(session, None)   # always the latest catalogued release
        if release is None:
            return None, []

        query = text(
            """
            SELECT *
            FROM modelled.finance_opportunity
            WHERE release_id = :release_id
              AND (:country_code IS NULL OR country_code = :country_code)
              AND (:sector IS NULL OR gpc_sectors ? :sector)
              AND (:eligible_actor IS NULL OR eligible_actor = :eligible_actor)
              AND (:status IS NULL OR status = :status)
            ORDER BY opportunity_name
            LIMIT :limit OFFSET :offset
            """
        )
        rows = session.execute(query, {
            "release_id": str(release["release_id"]),
            "country_code": country_code, "sector": sector,
            "eligible_actor": eligible_actor, "status": status,
            "limit": limit, "offset": offset,
        }).mappings().all()
        return release, rows


@api_router.get("/climate-finance/opportunities", summary="List Chile climate-finance opportunities")
def get_finance_opportunities(
    country_code: Optional[str] = Query(default="CL"),
    sector: Optional[str] = Query(default=None, description="GPC sector, e.g. stationary_energy"),
    eligible_actor: Optional[str] = Query(default=None, description="who can apply, e.g. municipality"),
    status: Optional[str] = Query(default=None, description="open | closed | rolling"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    release, rows = db_finance_opportunities(
        country_code, sector, eligible_actor, status, limit, offset,
    )
    if release is None:
        raise HTTPException(status_code=404, detail="No finance-inventory release found")

    return {
        "meta": {
            "country_code": country_code,
            "release": {
                "release_id": str(release["release_id"]),
                "version_label": release["version_label"],
                "released_at": _normalize_value(release["released_at"]),
                "source_dataset": DATASOURCE_NAME,
            },
            "filters": {
                "sector": sector, "eligible_actor": eligible_actor,
                "status": status, "limit": limit, "offset": offset,
            },
            "count": len(rows),
        },
        "data": [_row_to_payload(row) for row in rows],
    }
