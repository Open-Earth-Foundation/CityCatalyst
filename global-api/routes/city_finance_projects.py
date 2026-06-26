"""GET /api/v1/climate-finance/projects — Chile climate-finance precedent projects (country-level).

The precedent-projects reference list for a country: comparable work that has been
funded/awarded. Reads modelled.finance_project, with each project's action matches
(via finance_project_action) attached. Optional filters: sector, action_id. Latest
release of each datasource by default; pin with ?version_label= or ?release_id=.

Country-level companion to /climate-finance/opportunities; uses the shared provenance
helper (see engineering-standards/api-design.md).
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

_ENDPOINT = "GET /api/v1/climate-finance/projects"

# Fields surfaced per record (curated subset of modelled.finance_project),
# plus the aggregated action_matches; provenance fields stay in meta.datasources.
_FIELDS = [
    "project_name", "project_name_i18n", "sector", "jurisdiction", "actor_id",
    "lifecycle_stage", "funding_channel", "cost_total", "amount_committed",
    "amount_paid", "amount_unit", "funding_sources", "source_dataset", "country_code",
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
    out["action_matches"] = _normalize_value(row["action_matches"])
    # Per-record provenance pointer (maps into meta.datasources).
    out["datasource_name"] = names_by_release.get(str(row["release_id"]))
    return out


_PROJECTS_SQL = text(
    """
    SELECT
        fp.project_name, fp.project_name_i18n, fp.sector, fp.jurisdiction, fp.actor_id,
        fp.lifecycle_stage, fp.funding_channel,
        fp.cost_total, fp.amount_committed, fp.amount_paid, fp.amount_unit,
        fp.funding_sources, fp.source_dataset, fp.country_code, fp.release_id,
        (SELECT jsonb_agg(jsonb_build_object('action_id', fpa.action_id, 'confidence', fpa.confidence)
                          ORDER BY fpa.action_id)
         FROM modelled.finance_project_action fpa
         WHERE fpa.project_id = fp.project_id
           AND fpa.release_id = ANY(CAST(:release_ids AS uuid[]))
        ) AS action_matches
    FROM modelled.finance_project fp
    WHERE fp.release_id = ANY(CAST(:release_ids AS uuid[]))
      AND (:country_code IS NULL OR fp.country_code = :country_code)
      AND (:sector IS NULL OR fp.sector = :sector)
      AND (
            :action_id IS NULL
            OR EXISTS (
                SELECT 1 FROM modelled.finance_project_action fpa
                WHERE fpa.project_id = fp.project_id
                  AND fpa.action_id = :action_id
                  AND fpa.release_id = ANY(CAST(:release_ids AS uuid[]))
            )
          )
    ORDER BY fp.cost_total DESC NULLS LAST, fp.project_name
    LIMIT :limit OFFSET :offset
    """
)

_COUNT_SQL = text(
    """
    SELECT count(*)
    FROM modelled.finance_project fp
    WHERE fp.release_id = ANY(CAST(:release_ids AS uuid[]))
      AND (:country_code IS NULL OR fp.country_code = :country_code)
      AND (:sector IS NULL OR fp.sector = :sector)
      AND (
            :action_id IS NULL
            OR EXISTS (
                SELECT 1 FROM modelled.finance_project_action fpa
                WHERE fpa.project_id = fp.project_id
                  AND fpa.action_id = :action_id
                  AND fpa.release_id = ANY(CAST(:release_ids AS uuid[]))
            )
          )
    """
)


@api_router.get(
    "/climate-finance/projects",
    summary="List Chile climate-finance precedent projects",
)
def get_finance_projects(
    country_code: Optional[str] = Query(default="CL"),
    sector: Optional[str] = Query(default=None, description="GPC sector, e.g. stationary_energy"),
    action_id: Optional[str] = Query(default=None, description="Filter to projects matched to this action."),
    version_label: Optional[str] = Query(default=None, description="pin a release version, e.g. v1"),
    release_id: Optional[UUID] = Query(default=None, description="pin one exact release"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    cc = country_code.strip().upper() if country_code else None
    with SessionLocal() as session:
        # 1. Resolve which releases to read (latest by default; ?version_label / ?release_id pin).
        release_ids = resolve_release_ids(
            session,
            datasource_names=None,
            version_label=version_label,
            release_id=release_id,
        )
        if not release_ids:
            raise HTTPException(status_code=404, detail="No dataset releases found")

        params = {
            "release_ids": release_ids,
            "country_code": cc,
            "sector": sector,
            "action_id": action_id,
            "limit": limit,
            "offset": offset,
        }

        # 2. Query the fact table, scoped to those releases.
        total = session.execute(_COUNT_SQL, params).scalar() or 0
        rows = session.execute(_PROJECTS_SQL, params).mappings().all()

        if not rows:
            raise HTTPException(status_code=404, detail="No finance projects found")

        # 3. Build provenance for only the releases actually represented in the data.
        used_release_ids = {str(r["release_id"]) for r in rows}
        datasources = build_datasources(session, used_release_ids)
        names_by_release = {d["release_id"]: d["datasource_name"] for d in datasources}

    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": _ENDPOINT,
            "country_code": cc,
            "filters": {
                "sector": sector,
                "action_id": action_id,
                "version_label": version_label,
                "release_id": str(release_id) if release_id else None,
                "limit": limit,
                "offset": offset,
            },
            "total": int(total),
            "count": len(rows),
            "datasources": datasources,
        },
        "data": [_row_to_payload(row, names_by_release) for row in rows],
    }
