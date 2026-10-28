"""``GET /api/v1/cities/{locode}/action-policy-scores`` — rubric scores from ``modelled.city_action_policy_scores()``."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

_SCORING_RUBRIC_VERSION = "v0.2.0"

_SCORES_SQL = text(
    """
    SELECT
        locode,
        city_name,
        src_action_id,
        policy_support_score,
        policy_support_category,
        signal_type,
        signal_relation,
        signal_strength,
        best_relevance,
        n_findings,
        n_docs,
        sum_strength,
        evidence_rank,
        document_name,
        document_type,
        doc_relevance,
        explicitness,
        page,
        evidence_strength,
        evidence_text
    FROM modelled.city_action_policy_scores(
        :locode,
        :release_id,
        :top_evidence_limit
    )
    """
)

_SPATIAL_COVERAGE_SQL = text(
    """
    WITH target_city AS (
        SELECT
            cp.locode,
            LPAD(
                NULLIF(REGEXP_REPLACE(COALESCE(cp.region_code, ''), '[^0-9]', '', 'g'), ''),
                2,
                '0'
            ) AS region_code,
            cp.city_id AS comuna_code
        FROM modelled.city_polygon cp
        WHERE cp.locode = :locode
        LIMIT 1
    ),
    applicable_scopes AS (
        SELECT DISTINCT aps.location_scope
        FROM modelled.action_policy_signals aps
        CROSS JOIN target_city t
        WHERE aps.release_id = :release_id
          AND length(aps.evidence_text) > 30
          AND (
              aps.location_scope = 'national'
              OR (
                  aps.location_scope = 'regional'
                  AND aps.location_code IN (t.region_code, LPAD(t.region_code, 2, '0'))
              )
              OR (
                  aps.location_scope = 'municipal'
                  AND aps.location_code IN (
                      t.locode,
                      t.comuna_code,
                      LPAD(COALESCE(t.comuna_code, ''), 5, '0')
                  )
              )
          )
    )
    SELECT
        COALESCE(
            array_agg(location_scope ORDER BY location_scope),
            ARRAY[]::varchar[]
        ) AS location_scopes_included,
        CASE
            WHEN bool_or(location_scope = 'municipal') THEN 'municipal'
            WHEN bool_or(location_scope = 'regional') THEN 'regional'
            WHEN bool_or(location_scope = 'national') THEN 'national'
            ELSE NULL
        END AS finest_location_scope
    FROM applicable_scopes
    """
)

_DEFAULT_RELEASE_SQL = text(
    """
    SELECT dr.release_id
    FROM modelled.dataset_release dr
    JOIN modelled.publisher_datasource pd
      ON pd.publisher_id = dr.publisher_id
     AND pd.dataset_id = dr.dataset_id
    WHERE pd.datasource_name = 'cl-ssg-policy-documents'
      AND dr.version_label = 'v1'
    ORDER BY dr.retrieved_at DESC NULLS LAST
    LIMIT 1
    """
)

_SCOPE_ORDER = ("national", "regional", "municipal")


def _normalize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    return value


def _evidence_item(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if row.get("evidence_rank") is None:
        return None
    return {
        "evidence_rank": row["evidence_rank"],
        "signal_type": row["signal_type"],
        "signal_relation": row["signal_relation"],
        "signal_strength": row["signal_strength"],
        "document_name": row["document_name"],
        "document_type": row["document_type"],
        "doc_relevance": row["doc_relevance"],
        "explicitness": row["explicitness"],
        "page": row["page"],
        "evidence_strength": _normalize_value(row["evidence_strength"]),
        "evidence_text": row["evidence_text"],
    }


def _group_scores_by_action(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []

    for row in rows:
        action_id = row["src_action_id"]
        if action_id not in grouped:
            grouped[action_id] = {
                "src_action_id": action_id,
                "policy_support_score": _normalize_value(row["policy_support_score"]),
                "policy_support_category": row["policy_support_category"],
                "best_relevance": row["best_relevance"],
                "n_findings": row["n_findings"],
                "n_docs": row["n_docs"],
                "sum_strength": _normalize_value(row["sum_strength"]),
                "policy_evidence": [],
            }
            order.append(action_id)

        evidence = _evidence_item(row)
        if evidence is not None:
            grouped[action_id]["policy_evidence"].append(evidence)

    for action in grouped.values():
        action["policy_evidence"].sort(
            key=lambda item: item["evidence_rank"] if item["evidence_rank"] is not None else 0
        )

    return [grouped[action_id] for action_id in order]


def _resolve_release_id(session, release_id: Optional[UUID]) -> UUID:
    if release_id is not None:
        return release_id
    resolved = session.execute(_DEFAULT_RELEASE_SQL).scalar()
    if resolved is None:
        raise HTTPException(
            status_code=404,
            detail="No cl-ssg-policy-documents v1 dataset release found",
        )
    return resolved


def _ordered_scopes(scopes: List[str]) -> List[str]:
    scope_set = set(scopes)
    return [scope for scope in _SCOPE_ORDER if scope in scope_set]


def _spatial_document_caveat(
    finest_location_scope: Optional[str],
    location_scopes_included: List[str],
) -> str:
    if not finest_location_scope:
        return (
            "No policy documents in the current release apply to this city. "
            "Scores cannot reflect national, regional, or municipal policy context."
        )

    scopes_label = ", ".join(location_scopes_included) if location_scopes_included else finest_location_scope

    if finest_location_scope == "municipal":
        return (
            f"Policy support scores use documents at {scopes_label} level, "
            "including municipal plans (e.g. PACCC) for this city. "
            "Interpret scores as city-level policy advice where municipal evidence applies."
        )

    if finest_location_scope == "regional":
        return (
            f"Policy support scores use documents at {scopes_label} level only. "
            "No municipal-level documents (e.g. PACCC) for this city are included in the "
            "current release; interpret scores as regional-level policy advice, not "
            "city-specific municipal commitments."
        )

    return (
        "Policy support scores use national-level documents only. "
        "Regional PARCC and municipal PACCC plans for this city are not included in the "
        "current release; interpret scores as national-level policy advice."
    )


def _build_meta(
    *,
    locode: str,
    city_name: Optional[str],
    release_id: UUID,
    top_evidence_limit: int,
    src_action_id: Optional[str],
    total_actions: int,
    total_evidence_items: int,
    location_scopes_included: List[str],
    finest_location_scope: Optional[str],
) -> Dict[str, Any]:
    scopes = _ordered_scopes(location_scopes_included)
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "backend_consumer": "hiap-meed",
        "upstream_provider": "global-api",
        "scoring_rubric_version": _SCORING_RUBRIC_VERSION,
        "api_context": {
            "endpoint": "GET /api/v1/cities/{locode}/action-policy-scores",
            "locode": locode,
            "city_name": city_name,
            "release_id": str(release_id),
            "top_evidence_limit": top_evidence_limit,
            "src_action_id": src_action_id,
        },
        "total_records": total_actions,
        "total_evidence_items": total_evidence_items,
        "spatial_document_coverage": {
            "location_scopes_included": scopes,
            "finest_location_scope": finest_location_scope,
            "caveat": _spatial_document_caveat(finest_location_scope, scopes),
        },
    }


@api_router.get(
    "/cities/{locode}/action-policy-scores",
    summary="Per-city action policy scores (rubric v0.2.0)",
)
def get_city_action_policy_scores(
    locode: str,
    release_id: Optional[UUID] = Query(
        default=None,
        description="``modelled.dataset_release.release_id``; defaults to latest cl-ssg v1.",
    ),
    top_evidence_limit: int = Query(default=5, ge=0, le=20),
    src_action_id: Optional[str] = Query(default=None),
):
    with SessionLocal() as session:
        resolved_release_id = _resolve_release_id(session, release_id)
        coverage = (
            session.execute(
                _SPATIAL_COVERAGE_SQL,
                {"locode": locode, "release_id": resolved_release_id},
            )
            .mappings()
            .first()
        )
        rows = (
            session.execute(
                _SCORES_SQL,
                {
                    "locode": locode,
                    "release_id": resolved_release_id,
                    "top_evidence_limit": top_evidence_limit,
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
            detail="No policy scores found for this city and release",
        )

    flat_rows = [dict(row) for row in rows]
    scores = _group_scores_by_action(flat_rows)
    total_evidence_items = sum(len(action["policy_evidence"]) for action in scores)
    coverage_row = coverage or {}
    scopes_included = list(coverage_row.get("location_scopes_included") or [])

    return {
        "meta": _build_meta(
            locode=locode,
            city_name=flat_rows[0].get("city_name"),
            release_id=resolved_release_id,
            top_evidence_limit=top_evidence_limit,
            src_action_id=src_action_id,
            total_actions=len(scores),
            total_evidence_items=total_evidence_items,
            location_scopes_included=scopes_included,
            finest_location_scope=coverage_row.get("finest_location_scope"),
        ),
        "scores": scores,
    }
