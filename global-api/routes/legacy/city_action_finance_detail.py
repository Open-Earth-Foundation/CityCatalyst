"""GET /api/v1/cities/{locode}/climate-finance/actions/{action_id}.

The drill-down for one action: its feasibility score block (from
modelled.city_action_financial_feasibility), plus the full detail the lean feasibility list links
out to -- the reachable funding opportunities (with status / recurrence / amounts / source url) and
the precedent projects on record for the action.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal
from routes.legacy.city_action_financial_feasibility import (
    _CAVEAT,
    _compose_reason,
    _normalize_value,
)

api_router = APIRouter(prefix="/api/v1")

# the score row for one action (filtered in Python from the per-city function result)
_SCORE_SQL = text(
    """
    SELECT action_id, action_name, sector, capital_intensity, preparation_complexity,
           city_profile, route, fund_access, n_reachable_opportunities,
           n_existing_projects, financial_feasibility
    FROM modelled.city_action_financial_feasibility(:locode, :country_code)
    """
)

# reachable funds for the action's sector. Field order: name first ... source_url last.
_OPPORTUNITIES_SQL = text(
    """
    SELECT opportunity_name, funder_name, funder_level, funding_channel, access_tier, instrument,
           eligible_actor, city_application, status, status_as_of, recurrence,
           open_date, close_date, amount, amount_currency, amount_note, climate_relevance, source_url
    FROM modelled.finance_opportunity
    WHERE release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
      AND country_code = :country_code
      AND gpc_sectors ? :sector
    ORDER BY opportunity_name
    """
)

_PROJECTS_COUNT_SQL = text(
    """
    SELECT count(DISTINCT fp.project_id)
    FROM modelled.finance_project_action fpa
    JOIN modelled.finance_project fp ON fp.project_id = fpa.project_id
     AND fp.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
     AND fp.country_code = :country_code
    WHERE fpa.action_id = :action_id
      AND fpa.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
    """
)

_PROJECTS_SQL = text(
    """
    SELECT DISTINCT
           fp.project_name, fp.sector, fp.jurisdiction, fp.actor_id, fp.lifecycle_stage,
           fp.cost_total, fp.amount_committed, fp.amount_paid, fp.amount_unit,
           fp.funding_channel, fp.funding_sources, fp.source_dataset, fpa.confidence
    FROM modelled.finance_project_action fpa
    JOIN modelled.finance_project fp ON fp.project_id = fpa.project_id
     AND fp.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
     AND fp.country_code = :country_code
    WHERE fpa.action_id = :action_id
      AND fpa.release_id IN (SELECT release_id FROM modelled.dataset_release WHERE is_latest)
    ORDER BY fp.cost_total DESC NULLS LAST
    LIMIT :limit
    """
)


@api_router.get(
    "/cities/{locode}/climate-finance/actions/{action_id}",
    summary="One action: feasibility score + reachable funds + precedent projects",
)
def get_city_action_finance_detail(
    locode: str,
    action_id: str,
    country_code: str = Query(default="CL", min_length=2, max_length=2),
    project_limit: int = Query(default=50, ge=1, le=500),
):
    cc = country_code.strip().upper()
    with SessionLocal() as session:
        score_row = next(
            (
                dict(r)
                for r in session.execute(
                    _SCORE_SQL, {"locode": locode, "country_code": cc}
                ).mappings()
                if r["action_id"] == action_id
            ),
            None,
        )
        if score_row is None:
            raise HTTPException(
                status_code=404, detail="No feasibility found for this city and action"
            )
        sector = score_row.get("sector")

        opportunities = (
            session.execute(
                _OPPORTUNITIES_SQL, {"country_code": cc, "sector": sector}
            ).mappings().all()
            if sector
            else []
        )
        n_projects = session.execute(
            _PROJECTS_COUNT_SQL, {"country_code": cc, "action_id": action_id}
        ).scalar() or 0
        projects = (
            session.execute(
                _PROJECTS_SQL,
                {"country_code": cc, "action_id": action_id, "limit": project_limit},
            ).mappings().all()
        )

    r = {k: _normalize_value(v) for k, v in score_row.items()}
    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": "GET /api/v1/cities/{locode}/climate-finance/actions/{action_id}",
            "locode": locode,
            "country_code": cc,
            "caveat": _CAVEAT,
        },
        "data": {
            "action_id": r["action_id"],
            "action_name": r["action_name"],
            "sector": r["sector"],
            "financial_feasibility": r["financial_feasibility"],
            "route": r["route"],
            "reason": _compose_reason(r),
            "inputs": {
                "action": {
                    "capital_intensity": r["capital_intensity"],
                    "preparation_complexity": r["preparation_complexity"],
                },
                "city": {"profile": r["city_profile"]},
                "finance": {
                    "fund_access": r["fund_access"],
                    "n_reachable_opportunities": r.get("n_reachable_opportunities") or 0,
                },
                "evidence": {"n_existing_projects": r["n_existing_projects"]},
            },
            "opportunities": [
                {k: _normalize_value(v) for k, v in dict(o).items()} for o in opportunities
            ],
            "projects": {
                "total": int(n_projects),
                "showing": len(projects),
                "items": [
                    {k: _normalize_value(v) for k, v in dict(p).items()} for p in projects
                ],
            },
        },
    }
