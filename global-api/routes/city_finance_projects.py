"""GET /api/v1/cities/{locode}/climate-finance/projects.

The precedent-projects reference list: what comparable work has been funded/awarded, across all
actions. Reads modelled.finance_project, with each project's action matches (via
finance_project_action) attached. Filter by ?action_id, restrict to the city with ?scope=comuna
(vs national sector precedent), paginate with limit/offset.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal
from routes.city_action_financial_feasibility import _normalize_value

api_router = APIRouter(prefix="/api/v1")

# project fields ordered for reading: name first, provenance last. action_matches aggregated inline.
_PROJECTS_SQL = text(
    """
    SELECT
        fp.project_name, fp.project_name_i18n, fp.sector, fp.jurisdiction, fp.actor_id,
        fp.lifecycle_stage, fp.funding_channel,
        fp.cost_total, fp.amount_committed, fp.amount_paid, fp.amount_unit,
        fp.funding_sources, fp.source_dataset, fp.country_code,
        (SELECT jsonb_agg(jsonb_build_object('action_id', fpa.action_id, 'confidence', fpa.confidence)
                          ORDER BY fpa.action_id)
         FROM modelled.finance_project_action fpa
         WHERE fpa.project_id = fp.project_id
           AND fpa.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
        ) AS action_matches
    FROM modelled.finance_project fp
    WHERE fp.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
      AND fp.country_code = :country_code
      AND (:scope <> 'comuna' OR fp.actor_id = :locode)
      AND (
            :action_id IS NULL
            OR EXISTS (
                SELECT 1 FROM modelled.finance_project_action fpa
                WHERE fpa.project_id = fp.project_id
                  AND fpa.action_id = :action_id
                  AND fpa.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
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
    WHERE fp.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
      AND fp.country_code = :country_code
      AND (:scope <> 'comuna' OR fp.actor_id = :locode)
      AND (
            :action_id IS NULL
            OR EXISTS (
                SELECT 1 FROM modelled.finance_project_action fpa
                WHERE fpa.project_id = fp.project_id
                  AND fpa.action_id = :action_id
                  AND fpa.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
            )
          )
    """
)


@api_router.get(
    "/cities/{locode}/climate-finance/projects",
    summary="Precedent climate-finance projects (reference list, across all actions)",
)
def get_city_finance_projects(
    locode: str,
    country_code: str = Query(default="CL", min_length=2, max_length=2),
    action_id: Optional[str] = Query(default=None, description="Filter to projects matched to this action."),
    scope: str = Query(default="sector", description="sector = national precedent; comuna = this city only."),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    cc = country_code.strip().upper()
    sc = scope.strip().lower()
    if sc not in ("sector", "comuna"):
        raise HTTPException(status_code=422, detail="scope must be 'sector' or 'comuna'")
    params = {
        "locode": locode, "country_code": cc, "action_id": action_id,
        "scope": sc, "limit": limit, "offset": offset,
    }
    with SessionLocal() as session:
        total = session.execute(_COUNT_SQL, params).scalar() or 0
        rows = session.execute(_PROJECTS_SQL, params).mappings().all()

    data: List[Dict[str, Any]] = [
        {k: _normalize_value(v) for k, v in dict(row).items()} for row in rows
    ]
    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": "GET /api/v1/cities/{locode}/climate-finance/projects",
            "locode": locode,
            "country_code": cc,
            "filters": {"action_id": action_id, "scope": sc, "limit": limit, "offset": offset},
            "total": int(total),
            "count": len(data),
        },
        "data": data,
    }
