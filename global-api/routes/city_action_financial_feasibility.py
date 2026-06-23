"""GET /api/v1/cities/{locode}/climate-finance/feasibility.

Per-action climate-finance feasibility for a city, derived at read time by the
modelled.city_action_financial_feasibility(...) SQL function from the base finance tables
(finance_opportunity, finance_project + finance_project_action) and the CITY axes
(city_finance_profile, with a neutral 0.5 fallback when the city has no profile).

The score is transparent by construction: every input that produced it is returned under
`inputs`, grouped by the four model layers (action / city / finance / evidence).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

_FEASIBILITY_SQL = text(
    """
    SELECT
        locode,
        action_id,
        action_name,
        sector,
        capital_intensity,
        preparation_complexity,
        city_profile,
        city_layer,
        route,
        fund_access,
        n_reachable_opportunities,
        n_existing_projects,
        financial_feasibility
    FROM modelled.city_action_financial_feasibility(
        :locode,
        :country_code
    )
    """
)

_CAVEAT = (
    "Working estimate of financing feasibility, not a probability of securing funding; "
    "coverage reflects what is catalogued, not real-world award behaviour."
)


def _compose_reason(r: Dict[str, Any]) -> str:
    """One-sentence, read-at-a-glance explanation, composed from the same inputs as the score."""
    route = r["route"]
    fa = r["fund_access"]
    n_opp = r.get("n_reachable_opportunities") or 0
    n_prec = r.get("n_existing_projects") or 0
    fund_clause = {
        "direct": f"{n_opp} fund(s) the city can apply to directly",
        "competitive": f"{n_opp} fund(s), awarded competitively",
        "gap": "no catalogued fund yet for this sector",
    }.get(fa, fa)
    prec = f" {n_prec} comparable project(s) on record." if n_prec else ""
    base = {
        "self-deliverable": "Low-capital action the city can deliver itself.",
        "own-budget feasible": "Within the city's own budget and capacity.",
        "needs technical assistance": "Capacity is the constraint, not money; needs technical assistance.",
        "needs external co-finance": f"Capital need exceeds the city's autonomy; co-finance available via {fund_clause}.",
        "needs external finance + TA / pooling": f"High capital and preparation needs; external finance plus technical support, via {fund_clause}.",
    }.get(route, route)
    return base + prec


def _normalize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, dict):
        return {k: _normalize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_value(v) for v in value]
    return value


def _format_row(row: Dict[str, Any]) -> Dict[str, Any]:
    r = {k: _normalize_value(v) for k, v in row.items()}
    return {
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
            "city": {
                # the coarse city profile (category), not the raw autonomy/capacity numerics.
                # null when the city has no profile yet (the score then uses a neutral fallback).
                "profile": r["city_profile"],
            },
            "finance": {
                "fund_access": r["fund_access"],
                "n_reachable_opportunities": r.get("n_reachable_opportunities") or 0,
            },
            "evidence": {
                "n_existing_projects": r["n_existing_projects"],
            },
        },
        # the funds and precedent projects behind these numbers live in the detail routes
        "links": {
            "detail": f"/api/v1/cities/{r['locode']}/climate-finance/actions/{r['action_id']}",
            "opportunities": f"/api/v1/climate-finance/opportunities?sector={r['sector']}"
            if r.get("sector") else None,
            "projects": f"/api/v1/cities/{r['locode']}/climate-finance/projects?action_id={r['action_id']}",
        },
    }


@api_router.get(
    "/cities/{locode}/climate-finance/feasibility",
    summary="Per-city climate-finance feasibility scores (derived at read time)",
)
def get_city_action_financial_feasibility(
    locode: str,
    country_code: str = Query(default="CL", min_length=2, max_length=2),
    action_id: Optional[str] = Query(
        default=None, description="Filter to a single action_id."
    ),
):
    cc = country_code.strip().upper()
    with SessionLocal() as session:
        rows = (
            session.execute(
                _FEASIBILITY_SQL,
                {"locode": locode, "country_code": cc},
            )
            .mappings()
            .all()
        )

    if action_id:
        rows = [row for row in rows if row["action_id"] == action_id]

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No climate-finance feasibility found for this city",
        )

    data: List[Dict[str, Any]] = [_format_row(dict(row)) for row in rows]

    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": "GET /api/v1/cities/{locode}/climate-finance/feasibility",
            "locode": locode,
            "country_code": cc,
            "caveat": _CAVEAT,
            "filters": {"action_id": action_id},
            "total_records": len(data),
        },
        "data": data,
    }
