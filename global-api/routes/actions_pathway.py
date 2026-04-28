"""
``GET /api/v1/action-pathways`` — JSON array of actions from ``modelled.action_pathway`` and
``modelled.action_pathway_mitigation_impact`` (emissions + coBenefits only; no meta wrapper).
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import bindparam, text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

_EMISSIONS_METRIC = "emissions_reduction"

_PATHWAY_SQL = text(
    """
    SELECT
        ap.pathway_id,
        ap.src_action_id,
        ap.publisher_id,
        ap.action_type,
        ap.action_role,
        ap.intervention_type,
        ap.investment_cost,
        ap.implementation_timeline,
        ap.generation_method,
        ap.name_i18n,
        ap.description_i18n,
        ap.intervention_summary_i18n,
        ap.outcome_summary_i18n,
        ap.release_id,
        ap.created_at,
        ap.updated_at
    FROM modelled.action_pathway ap
    WHERE
        (btrim(:rid) <> '' AND ap.release_id = CAST(btrim(:rid) AS uuid))
        OR (btrim(:rid) = '')
    ORDER BY ap.release_id, ap.publisher_id, ap.src_action_id
    LIMIT :limit
    """
)

_IMPACT_SQL = text(
    """
    SELECT *
    FROM modelled.action_pathway_mitigation_impact
    WHERE pathway_id IN :pids
    ORDER BY pathway_id, metric_name
    """
).bindparams(bindparam("pids", expanding=True))

# Pathway columns copied onto each action (JSON-safe), besides the display keys above.
_EXTRA_COLUMNS = (
    "publisher_id",
    "generation_method",
    "name_i18n",
    "description_i18n",
    "intervention_summary_i18n",
    "outcome_summary_i18n",
)


def _jsonify(value: Any) -> Any:
    """DB values -> JSON-serializable."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonify(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonify(v) for v in value]
    return value


def _i18n_text(blob: Any, lang: str = "en") -> Optional[str]:
    """First non-empty string from an i18n JSONB object."""
    if blob is None:
        return None
    if isinstance(blob, str):
        try:
            blob = json.loads(blob)
        except (json.JSONDecodeError, TypeError):
            return blob.strip() or None
    if not isinstance(blob, dict):
        return None
    for key in (lang.lower(), "en", "es", "pt"):
        v = blob.get(key)
        if v and str(v).strip():
            return str(v).strip()
    for v in blob.values():
        if v and str(v).strip():
            return str(v).strip()
    return None


def _gpc_codes(raw: Any) -> List[str]:
    """Normalize ``gpc_reference_number`` from DB to a list of strings."""
    if isinstance(raw, list):
        return [str(x) for x in raw if str(x).strip()]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if str(x).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
    return []


def _impact_as_legacy(row: Dict[str, Any]) -> Dict[str, Any]:
    """Impact row -> hiap-style impact dict."""
    num = row.get("metric_value_numeric")
    rel = None
    if num is not None:
        try:
            f = float(num)
            rel = "positive" if f > 0 else "negative" if f < 0 else "neutral"
        except (TypeError, ValueError):
            pass
    gpcs = _gpc_codes(row.get("gpc_reference_number"))
    sector = gpcs[0].split(".")[0] if gpcs else ""
    sub = 0
    if gpcs and "." in gpcs[0]:
        parts = gpcs[0].split(".")
        if len(parts) > 1:
            try:
                sub = int(parts[1])
            except ValueError:
                sub = 0
    n_int = None
    if num is not None:
        try:
            n_int = int(Decimal(str(num)))
        except (ArithmeticError, ValueError):
            pass
    units = (row.get("metric_units") or "").lower()
    return {
        "sector_number": sector,
        "subsector_number": sub,
        "gpc_reference_number": gpcs,
        "impact_relationship": rel,
        "impact_text": row.get("metric_value_text"),
        "impact_numeric": n_int,
        "methodology": "expert review" if units == "qualitative" else (row.get("metric_units") or "dataset"),
    }


def _emissions_and_cobenefits(impacts: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """Split mitigation impact rows into emissions (one) and co-benefits (by metric name)."""
    emissions: Optional[Dict[str, Any]] = None
    co_benefits: Dict[str, Any] = {}
    for im in impacts:
        name = (im.get("metric_name") or "").strip()
        if not name:
            continue
        shaped = _impact_as_legacy(im)
        if name == _EMISSIONS_METRIC and shaped.get("impact_text"):
            emissions = shaped
        elif name != _EMISSIONS_METRIC and (
            shaped.get("impact_text") is not None or shaped.get("impact_numeric") is not None
        ):
            co_benefits[name] = shaped
    return emissions, co_benefits


def _action_dict(row: Dict[str, Any], lang: str, impacts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """One pathway row + its impacts -> one API action object."""
    emissions, co_benefits = _emissions_and_cobenefits(impacts)
    out: Dict[str, Any] = {
        "actionId": row.get("src_action_id") or "",
        "action_type": row.get("action_type"),
        "actionName": _i18n_text(row.get("name_i18n"), lang) or row.get("src_action_id") or "",
        "description": _i18n_text(row.get("description_i18n"), lang),
        "intervention_summary": _i18n_text(row.get("intervention_summary_i18n"), "en"),
        "outcome_summary": _i18n_text(row.get("outcome_summary_i18n"), "en"),
        "intervention_type": row.get("intervention_type"),
        "action_role": row.get("action_role"),
        "costInvestmentNeeded": row.get("investment_cost"),
        "timelineForImplementation": row.get("implementation_timeline"),
        "coBenefits": co_benefits,
        "emissions": emissions,
    }
    for key in _EXTRA_COLUMNS:
        out[key] = _jsonify(row.get(key))
    return out


@api_router.get("/action-pathways", summary="List action pathways")
def list_actions_pathways(
    release_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    lang: str = Query(default="en"),
):
    """List pathways; pass ``release_id`` to restrict to one catalog release."""
    rid = str(release_id).strip() if release_id else ""

    with SessionLocal() as session:
        pathways = list(session.execute(_PATHWAY_SQL, {"rid": rid, "limit": limit}).mappings().all())
        if not pathways:
            return []
        ids = [p["pathway_id"] for p in pathways]
        impact_rows = list(session.execute(_IMPACT_SQL, {"pids": ids}).mappings().all())

    by_pathway: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in impact_rows:
        d = dict(r)
        by_pathway[str(d["pathway_id"])].append(d)

    return [
        _action_dict(dict(p), lang, by_pathway[str(p["pathway_id"])]) for p in pathways
    ]
