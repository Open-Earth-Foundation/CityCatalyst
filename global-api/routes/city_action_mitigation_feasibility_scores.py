"""GET /api/v1/cities/{locode}/action-mitigation-feasibility-scores.

Returns per-action feasibility scores with IPCC causal-chain metadata
(global_mitigation_option, action_mapping_strength, option_family) and
dimension-level breakdown.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

_SCORES_SQL = text(
    """
    SELECT
        locode,
        src_action_id,
        global_mitigation_option,
        action_mapping_strength,
        option_family,
        score,
        n_indicators_total,
        n_dims_scored,
        econ,
        tech,
        inst,
        soc,
        env,
        geo,
        breakdown,
        rank_within_city
    FROM modelled.city_action_mitigation_feasibility_scores(
        :locode,
        :release_id,
        :country_code
    )
    """
)

_DEFAULT_RELEASE_SQL = text(
    """
    SELECT dr.release_id
    FROM modelled.dataset_release dr
    JOIN modelled.publisher_datasource pd
      ON pd.publisher_id = dr.publisher_id
     AND pd.dataset_id = dr.dataset_id
    WHERE pd.datasource_name = 'ipcc-sr15-mitigation-feasibility'
      AND dr.version_label = '2018'
    ORDER BY dr.retrieved_at DESC NULLS LAST
    LIMIT 1
    """
)


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


def _ordered_city_indicator(item: Dict[str, Any]) -> Dict[str, Any]:
    """Stable key order for one city bridge row (jsonb does not preserve order)."""
    order = ("city_indicator", "category", "direction", "capacity", "contribution")
    return {key: item[key] for key in order if key in item}


def _ordered_indicator(item: Dict[str, Any]) -> Dict[str, Any]:
    """Global evidence first, blended score fields, city_indicators last."""
    order = (
        "global_indicator",
        "global_verdict",
        "global_contribution",
        "n_city_indicators",
        "avg_city_contribution",
        "indicator_score",
        "city_indicators",
    )
    out: Dict[str, Any] = {}
    for key in order:
        if key not in item:
            continue
        value = item[key]
        if key == "city_indicators" and isinstance(value, list):
            out[key] = [_ordered_city_indicator(ci) for ci in value]
        else:
            out[key] = value
    return out


def _ordered_breakdown(breakdown: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not breakdown:
        return breakdown
    ordered: Dict[str, Any] = {}
    for dimension, dim_data in breakdown.items():
        dim_out: Dict[str, Any] = {}
        dimension_score = dim_data.get("dimension_score", dim_data.get("score"))
        n_global = dim_data.get("n_global_indicators", dim_data.get("n_indicators"))
        indicators = dim_data.get("global_indicators", dim_data.get("indicators", []))
        if dimension_score is not None:
            dim_out["dimension_score"] = dimension_score
        if n_global is not None:
            dim_out["n_global_indicators"] = n_global
        dim_out["global_indicators"] = [_ordered_indicator(ind) for ind in indicators]
        ordered[dimension] = dim_out
    return ordered


def _dimension_scores(row: Dict[str, Any]) -> Dict[str, Any]:
    """Build full-dimension score object from SQL function columns."""
    dimensions = (
        ("economic", row.get("econ")),
        ("technological", row.get("tech")),
        ("institutional", row.get("inst")),
        ("socio_cultural", row.get("soc")),
        ("environmental", row.get("env")),
        ("geophysical", row.get("geo")),
    )
    return {
        name: _normalize_value(value)
        for name, value in dimensions
        if value is not None
    }


def _format_score_row(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {key: _normalize_value(value) for key, value in row.items()}
    return {
        "locode": normalized["locode"],
        "src_action_id": normalized["src_action_id"],
        "global_mitigation_option": normalized["global_mitigation_option"],
        "action_mapping_strength": normalized["action_mapping_strength"],
        "option_family": normalized["option_family"],
        "action_score": normalized["score"],
        "n_feasibility_dimensions": normalized["n_dims_scored"],
        "dimension_scores": _dimension_scores(normalized),
        "breakdown": _ordered_breakdown(normalized.get("breakdown")),
        "rank_within_city": normalized["rank_within_city"],
    }


def _resolve_release_id(session, release_id: Optional[UUID]) -> UUID:
    if release_id is not None:
        return release_id
    resolved = session.execute(_DEFAULT_RELEASE_SQL).scalar()
    if resolved is None:
        raise HTTPException(
            status_code=404,
            detail="No ipcc-sr15-mitigation-feasibility 2018 dataset release found",
        )
    return resolved


@api_router.get(
    "/cities/{locode}/action-mitigation-feasibility-scores",
    summary="Per-city action mitigation feasibility scores",
)
def get_city_action_mitigation_feasibility_scores(
    locode: str,
    release_id: Optional[UUID] = Query(
        default=None,
        description="modelled.dataset_release.release_id; defaults to latest IPCC SR1.5 2018 release.",
    ),
    src_action_id: Optional[str] = Query(default=None),
    country_code: str = Query(default="CL", min_length=2, max_length=2),
):
    cc = country_code.strip().upper()
    with SessionLocal() as session:
        resolved_release_id = _resolve_release_id(session, release_id)
        rows = (
            session.execute(
                _SCORES_SQL,
                {
                    "locode": locode,
                    "release_id": resolved_release_id,
                    "country_code": cc,
                },
            )
            .mappings()
            .all()
        )

    if src_action_id:
        rows = [row for row in rows if row["src_action_id"] == src_action_id]

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No mitigation feasibility scores found for this city and release",
        )

    scores: List[Dict[str, Any]] = []
    for row in rows:
        scores.append(_format_score_row(dict(row)))

    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": "GET /api/v1/cities/{locode}/action-mitigation-feasibility-scores",
            "locode": locode,
            "country_code": cc,
            "release_id": str(resolved_release_id),
            "src_action_id": src_action_id,
            "total_records": len(scores),
        },
        "scores": scores,
    }
