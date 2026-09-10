"""``GET /api/v1/action-legal-assessments`` — SSG legal analysis rows from ``modelled.action_legal_assessement``.

Response objects use **camelCase** keys; query parameters remain snake_case per API standards.
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

_LIST_SQL = text(
    """
    SELECT
        legal_analysis_id,
        src_action_id,
        country_code,
        gpc_sector,
        verdict_category,
        verdict_score,
        ownership_category,
        ownership_score,
        ownership_weight,
        ownership_description,
        restrictions_category,
        restrictions_score,
        restrictions_weight,
        restrictions_description,
        legal_justification,
        analysis_date,
        generation_method,
        legal_references,
        release_id,
        created_at,
        updated_at,
        ownership_description_i18n,
        restrictions_description_i18n,
        legal_justification_i18n
    FROM modelled.action_legal_assessement
    WHERE
        (
            (btrim(:release_id) <> '' AND release_id = CAST(btrim(:release_id) AS uuid))
            OR (btrim(:release_id) = '')
        )
        AND (
            btrim(:country_code) = ''
            OR country_code = upper(btrim(:country_code))
        )
        AND (
            btrim(:src_action_id) = ''
            OR src_action_id = btrim(:src_action_id)
        )
        AND NULLIF(btrim(verdict_category), '') IS NOT NULL
    ORDER BY release_id, country_code, src_action_id
    LIMIT :limit
    """
)


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


def _row_to_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    """DB row -> JSON-serializable dict with camelCase keys (i18n blobs keep ``en`` / ``es``)."""
    return {
        "legalAnalysisId": str(row["legal_analysis_id"]),
        "srcActionId": row["src_action_id"],
        "countryCode": row["country_code"],
        "gpcSector": row["gpc_sector"],
        "verdictCategory": row["verdict_category"],
        "verdictScore": _normalize_value(row["verdict_score"]),
        "ownershipCategory": row["ownership_category"],
        "ownershipScore": _normalize_value(row["ownership_score"]),
        "ownershipWeight": _normalize_value(row["ownership_weight"]),
        "ownershipDescription": row["ownership_description"],
        "restrictionsCategory": row["restrictions_category"],
        "restrictionsScore": _normalize_value(row["restrictions_score"]),
        "restrictionsWeight": _normalize_value(row["restrictions_weight"]),
        "restrictionsDescription": row["restrictions_description"],
        "legalJustification": row["legal_justification"],
        "analysisDate": _normalize_value(row["analysis_date"]),
        "generationMethod": row["generation_method"],
        "legalReferences": _normalize_value(row["legal_references"]),
        "releaseId": str(row["release_id"]),
        "createdAt": _normalize_value(row["created_at"]),
        "updatedAt": _normalize_value(row["updated_at"]),
        "ownershipDescriptionI18n": _normalize_value(row["ownership_description_i18n"]),
        "restrictionsDescriptionI18n": _normalize_value(row["restrictions_description_i18n"]),
        "legalJustificationI18n": _normalize_value(row["legal_justification_i18n"]),
    }


@api_router.get(
    "/action-legal-assessments",
    summary="List action legal assessments",
)
def list_action_legal_assessments(
    release_id: Optional[UUID] = Query(
        default=None,
        description="Restrict to this ``modelled.dataset_release.release_id``.",
    ),
    country_code: Optional[str] = Query(
        default=None,
        description="ISO-3166-1 alpha-2 country code (e.g. ``CL``).",
    ),
    src_action_id: Optional[str] = Query(
        default=None,
        description="Restrict to this source action id (e.g. ``c40_0034``).",
    ),
    limit: int = Query(default=500, ge=1, le=2000),
):
    """Return legal assessment rows; omit staging-only rows (no ``verdict_category``)."""
    rid = str(release_id).strip() if release_id else ""
    cc = (country_code or "").strip().upper()
    if cc and len(cc) != 2:
        raise HTTPException(
            status_code=400,
            detail="country_code must be a two-letter ISO-3166-1 alpha-2 code when provided.",
        )
    sid = (src_action_id or "").strip()

    params = {
        "release_id": rid,
        "country_code": cc,
        "src_action_id": sid,
        "limit": limit,
    }

    with SessionLocal() as session:
        rows = list(session.execute(_LIST_SQL, params).mappings().all())

    return [_row_to_payload(dict(r)) for r in rows]
