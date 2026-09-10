"""
``GET /api/v1/action-pathways`` — JSON object with ``meta`` and ``actions``; all property names
use **camelCase** (including ``meta`` and nested impact objects). Data from ``modelled.action_pathway``
and ``modelled.action_pathway_mitigation_impact`` (emissions + coBenefits on each item).
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


def _snake_to_camel(name: str) -> str:
    """``snake_case`` / ``snake_case_i18n`` → ``camelCase`` / ``camelI18n`` for JSON keys."""
    parts = name.split("_")
    if not parts:
        return name
    return parts[0] + "".join(p[:1].upper() + p[1:] if p else "" for p in parts[1:])

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


def _subsector_number_from_gpc_codes(gpcs: List[str]) -> List[int]:
    """
    First numeric segment after the sector for each GPC code (``1`` in ``I.1.1`` and ``I.1.2``).

    Returns a **sorted list of distinct** values (always an array, e.g. ``[1]`` or ``[1, 2]``).
    """
    subs: set[int] = set()
    for code in gpcs:
        parts = [p.strip() for p in str(code).split(".") if p.strip()]
        if len(parts) < 2:
            continue
        try:
            subs.add(int(parts[1]))
        except (ValueError, TypeError):
            continue
    return sorted(subs)


def _impact_dict(row: Dict[str, Any], *, include_gpc: bool) -> Dict[str, Any]:
    """Impact row -> API dict. Co-benefits omit GPC sector/refs; emissions may include them."""
    num = row.get("metric_value_numeric")
    rel = None
    if num is not None:
        try:
            f = float(num)
            rel = "positive" if f > 0 else "negative" if f < 0 else "neutral"
        except (TypeError, ValueError):
            pass
    n_int = None
    if num is not None:
        try:
            n_int = int(Decimal(str(num)))
        except (ArithmeticError, ValueError):
            pass
    units = (row.get("metric_units") or "").lower()
    out: Dict[str, Any] = {
        "impactRelationship": rel,
        "impactText": row.get("metric_value_text"),
        "impactNumeric": n_int,
        "methodology": "expert review" if units == "qualitative" else (row.get("metric_units") or "dataset"),
    }
    if include_gpc:
        gpcs = _gpc_codes(row.get("gpc_reference_number"))
        sector = gpcs[0].split(".")[0] if gpcs else ""
        out["sectorNumber"] = sector
        out["subsectorNumber"] = _subsector_number_from_gpc_codes(gpcs)
        out["gpcReferenceNumber"] = gpcs
    return out


def _emissions_and_cobenefits(impacts: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """Split mitigation impact rows into emissions (one) and co-benefits (by metric name)."""
    emissions: Optional[Dict[str, Any]] = None
    co_benefits: Dict[str, Any] = {}
    for im in impacts:
        name = (im.get("metric_name") or "").strip()
        if not name:
            continue
        shaped = _impact_dict(im, include_gpc=(name == _EMISSIONS_METRIC))
        if name == _EMISSIONS_METRIC and shaped.get("impactText"):
            emissions = shaped
        elif name != _EMISSIONS_METRIC and (
            shaped.get("impactText") is not None or shaped.get("impactNumeric") is not None
        ):
            co_benefits[name] = shaped
    return emissions, co_benefits


def _action_dict(row: Dict[str, Any], lang: str, impacts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """One pathway row + its impacts -> one API action object."""
    emissions, co_benefits = _emissions_and_cobenefits(impacts)
    out: Dict[str, Any] = {
        "actionId": row.get("src_action_id") or "",
        "actionType": row.get("action_type"),
        "actionName": _i18n_text(row.get("name_i18n"), lang) or row.get("src_action_id") or "",
        "description": _i18n_text(row.get("description_i18n"), lang),
        "interventionSummary": _i18n_text(row.get("intervention_summary_i18n"), "en"),
        "outcomeSummary": _i18n_text(row.get("outcome_summary_i18n"), "en"),
        "interventionType": row.get("intervention_type"),
        "actionRole": row.get("action_role"),
        "costInvestmentNeeded": row.get("investment_cost"),
        "timelineForImplementation": row.get("implementation_timeline"),
        "coBenefits": co_benefits,
        "emissions": emissions,
    }
    for key in _EXTRA_COLUMNS:
        out[_snake_to_camel(key)] = _jsonify(row.get(key))
    return out


def _action_pathways_meta(*, total_records: int) -> Dict[str, Any]:
    """Envelope aligned with hiap-meed ``UpstreamMeta`` (camelCase JSON from this API)."""
    return {
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        # Caller is unknown at this edge; aggregators (e.g. hiap-meed) may overwrite when proxying.
        "backendConsumer": "unspecified",
        "upstreamProvider": "global-api",
        "apiContext": {"endpoint": "GET /api/v1/action-pathways"},
        "totalRecords": total_records,
    }


_LIST_ACTION_PATHWAYS_ROUTE_METADATA = {
    "summary": "List action pathways",
    "description": (
        "Returns ``meta`` and ``actions`` with **camelCase** property names. ``meta`` includes "
        "``generatedAtUtc``, ``backendConsumer``, ``upstreamProvider``, ``apiContext``, "
        "``totalRecords``. ``emissions`` may include GPC sector and reference fields when present; "
        "``coBenefits`` impact objects omit those GPC fields. ``emissions.subsectorNumber`` is "
        "always an array of sorted distinct first numeric segments after the sector across "
        "``gpcReferenceNumber`` (e.g. ``[1]`` for ``I.1.1`` and ``I.1.2``, or ``[1, 2]`` when they "
        "differ). Optional ``release_id`` scopes results "
        "to one catalog release; omit it "
        "to return rows from all releases (subject to ``limit``)."
    ),
    "operation_id": "list_action_pathways",
}

@api_router.get("/action-pathways", **_LIST_ACTION_PATHWAYS_ROUTE_METADATA)
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
            return {"meta": _action_pathways_meta(total_records=0), "actions": []}
        ids = [p["pathway_id"] for p in pathways]
        impact_rows = list(session.execute(_IMPACT_SQL, {"pids": ids}).mappings().all())

    by_pathway: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in impact_rows:
        d = dict(r)
        by_pathway[str(d["pathway_id"])].append(d)

    actions = [
        _action_dict(dict(p), lang, by_pathway[str(p["pathway_id"])]) for p in pathways
    ]
    return {
        "meta": _action_pathways_meta(total_records=len(actions)),
        "actions": actions,
    }
