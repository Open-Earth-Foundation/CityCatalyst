"""GET /api/v1/climate-finance/opportunities — Chile climate-finance supply catalogue.

Lists funding opportunities from modelled.finance_opportunity for a country, with optional
filters (sector, eligible actor, status). Returns the latest release of each finance
datasource by default; pin an exact version with ?version_label= or ?release_id=.

Reference implementation of the response/provenance standard
(see engineering-standards/api-design.md): provenance comes entirely from
db.provenance, every record carries release_id, and meta.datasources lists only
the sources actually represented in the response.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal
from db.provenance import resolve_release_ids, build_datasources

api_router = APIRouter(prefix="/api/v1")

_ENDPOINT = "GET /api/v1/climate-finance/opportunities"

# Fields surfaced per record (curated subset of modelled.finance_opportunity).
_FIELDS = [
    "opportunity_name", "funder_name", "funder_level", "funder_channel", "provider",
    "instrument", "gpc_sectors", "eligible_actor", "eligible_actor_detail",
    "city_application", "funding_channel", "access_tier", "open_date", "close_date",
    "status", "status_as_of", "recurrence", "amount", "amount_currency", "amount_note",
    "climate_relevance", "specificity", "source_url", "legal_basis_url", "notes",
    "country_code", "source_dataset",
]


def _normalize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _normalize_value(v) for k, v in value.items()}
    return value


def _row_to_payload(row: Dict[str, Any], names_by_release: Dict[str, str]) -> Dict[str, Any]:
    out = {k: _normalize_value(row[k]) for k in _FIELDS}
    # Per-record provenance pointer: datasource_name maps into meta.datasources
    # (which carries the release_id).
    out["datasource_name"] = names_by_release.get(str(row["release_id"]))
    return out


@api_router.get("/climate-finance/opportunities", summary="List Chile climate-finance opportunities")
def get_finance_opportunities(
    country_code: Optional[str] = Query(default="CL"),
    sector: Optional[str] = Query(default=None, description="GPC sector, e.g. stationary_energy"),
    eligible_actor: Optional[str] = Query(default=None, description="who can apply, e.g. municipality"),
    status: Optional[str] = Query(default=None, description="open | closed | rolling"),
    version_label: Optional[str] = Query(default=None, description="pin a release version, e.g. v1"),
    release_id: Optional[UUID] = Query(default=None, description="pin one exact release"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    with SessionLocal() as session:
        # 1. Resolve which releases to read (latest by default; ?version_label / ?release_id pin).
        #    datasource_names=None -> all datasources; the join to finance_opportunity below
        #    naturally restricts to finance releases.
        release_ids = resolve_release_ids(
            session,
            datasource_names=None,
            version_label=version_label,
            release_id=release_id,
        )
        if not release_ids:
            raise HTTPException(status_code=404, detail="No dataset releases found")

        # 2. Query the fact table, scoped to those releases.
        rows = session.execute(
            text(
                """
                SELECT fo.*
                FROM modelled.finance_opportunity fo
                WHERE fo.release_id = ANY(CAST(:release_ids AS uuid[]))
                  AND (:country_code IS NULL OR fo.country_code = :country_code)
                  AND (:sector IS NULL OR fo.gpc_sectors ? :sector)
                  AND (:eligible_actor IS NULL OR fo.eligible_actor ? :eligible_actor)
                  AND (:status IS NULL OR fo.status = :status)
                ORDER BY fo.opportunity_name
                LIMIT :limit OFFSET :offset
                """
            ),
            {
                "release_ids": release_ids,
                "country_code": country_code,
                "sector": sector,
                "eligible_actor": eligible_actor,
                "status": status,
                "limit": limit,
                "offset": offset,
            },
        ).mappings().all()

        if not rows:
            raise HTTPException(status_code=404, detail="No finance opportunities found")

        # 3. Build provenance for only the releases actually represented in the data.
        used_release_ids = {str(r["release_id"]) for r in rows}
        datasources = build_datasources(session, used_release_ids)
        names_by_release = {d["release_id"]: d["datasource_name"] for d in datasources}

    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": _ENDPOINT,
            "country_code": country_code,
            "filters": {
                "sector": sector,
                "eligible_actor": eligible_actor,
                "status": status,
                "version_label": version_label,
                "release_id": str(release_id) if release_id else None,
                "limit": limit,
                "offset": offset,
            },
            "count": len(rows),
            "datasources": datasources,
        },
        "data": [_row_to_payload(row, names_by_release) for row in rows],
    }
