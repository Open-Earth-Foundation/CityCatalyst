from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")


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


def _row_to_summary_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "project_summary_id": str(row["project_summary_id"]),
        "project_id": str(row["project_id"]),
        "source_name": row["source_name"],
        "source_project_id": row["source_project_id"],
        "project_title": row["project_title"],
        "funder_id": row["funder_id"],
        "funder_name": row["funder_name"],
        "country_name": row["country_name"],
        "country_code": row["country_code"],
        "region_name": row["region_name"],
        "city_name": row["city_name"],
        "project_type": row["project_type"],
        "sector_name": row["sector_name"],
        "subsector_name": row["subsector_name"],
        "approval_at": _normalize_value(row["approval_at"]),
        "closing_at": _normalize_value(row["closing_at"]),
        "project_status": row["project_status"],
        "total_budget_amount_usd": _normalize_value(row["total_budget_amount_usd"]),
        "primary_funder_amount_usd": _normalize_value(row["primary_funder_amount_usd"]),
        "financing_instrument": row["financing_instrument"],
        "project_summary_text": row["project_summary_text"],
        "lessons_learned": row["lessons_learned"],
        "synthesis_notes": row["synthesis_notes"],
        "site_context": _normalize_value(row["site_context"]),
        "financing_structure": _normalize_value(row["financing_structure"]),
        "data_completeness": _normalize_value(row["data_completeness"]),
        "actions_implemented": _normalize_value(row["actions_implemented"]),
        "key_risks": _normalize_value(row["key_risks"]),
        "evidence_anchors": _normalize_value(row["evidence_anchors"]),
        "secondary_project_types": _normalize_value(row["secondary_project_types"]),
        "co_financiers": _normalize_value(row["co_financiers"]),
        "co_benefits": _normalize_value(row["co_benefits"]),
        "key_interventions": _normalize_value(row["key_interventions"]),
        "replicability_conditions": _normalize_value(row["replicability_conditions"]),
        "model_metadata": _normalize_value(row["model_metadata"]),
    }


def db_projects(
    country_code: Optional[str],
    source_name: Optional[str],
    project_status: Optional[str],
    limit: int,
    offset: int,
):
    with SessionLocal() as session:
        query = text(
            """
            SELECT
                ps.project_summary_id,
                ps.project_id,
                pp.source_name,
                ps.source_project_id,
                ps.project_title,
                ps.funder_id,
                ps.funder_name,
                ps.country_name,
                ps.country_code,
                ps.region_name,
                ps.city_name,
                ps.project_type,
                ps.sector_name,
                ps.subsector_name,
                ps.approval_at,
                ps.closing_at,
                ps.project_status,
                ps.total_budget_amount_usd,
                ps.primary_funder_amount_usd,
                ps.financing_instrument,
                ps.project_summary_text,
                ps.lessons_learned,
                ps.synthesis_notes,
                ps.site_context,
                ps.financing_structure,
                ps.data_completeness,
                ps.actions_implemented,
                ps.key_risks,
                ps.evidence_anchors,
                ps.secondary_project_types,
                ps.co_financiers,
                ps.co_benefits,
                ps.key_interventions,
                ps.replicability_conditions,
                ps.model_metadata
            FROM modelled.project_summary ps
            JOIN modelled.project_portfolio pp
              ON pp.project_id = ps.project_id
            WHERE
              (:country_code IS NULL OR ps.country_code = :country_code)
              AND (:source_name IS NULL OR pp.source_name = :source_name)
              AND (:project_status IS NULL OR ps.project_status = :project_status)
            ORDER BY ps.approval_at DESC NULLS LAST, ps.project_title
            LIMIT :limit
            OFFSET :offset
            """
        )

        return (
            session.execute(
                query,
                {
                    "country_code": country_code,
                    "source_name": source_name,
                    "project_status": project_status,
                    "limit": limit,
                    "offset": offset,
                },
            )
            .mappings()
            .all()
        )


def db_project_by_id(project_id: UUID):
    with SessionLocal() as session:
        query = text(
            """
            SELECT
                ps.project_summary_id,
                ps.project_id,
                pp.source_name,
                ps.source_project_id,
                ps.project_title,
                ps.funder_id,
                ps.funder_name,
                ps.country_name,
                ps.country_code,
                ps.region_name,
                ps.city_name,
                ps.project_type,
                ps.sector_name,
                ps.subsector_name,
                ps.approval_at,
                ps.closing_at,
                ps.project_status,
                ps.total_budget_amount_usd,
                ps.primary_funder_amount_usd,
                ps.financing_instrument,
                ps.project_summary_text,
                ps.lessons_learned,
                ps.synthesis_notes,
                ps.site_context,
                ps.financing_structure,
                ps.data_completeness,
                ps.actions_implemented,
                ps.key_risks,
                ps.evidence_anchors,
                ps.secondary_project_types,
                ps.co_financiers,
                ps.co_benefits,
                ps.key_interventions,
                ps.replicability_conditions,
                ps.model_metadata
            FROM modelled.project_summary ps
            JOIN modelled.project_portfolio pp
              ON pp.project_id = ps.project_id
            WHERE ps.project_id = :project_id
            """
        )
        return (
            session.execute(query, {"project_id": str(project_id)})
            .mappings()
            .first()
        )


@api_router.get("/projects", summary="List project summaries")
def get_projects(
    country_code: Optional[str] = Query(default=None),
    source_name: Optional[str] = Query(default=None),
    project_status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = db_projects(country_code, source_name, project_status, limit, offset)
    if not rows:
        raise HTTPException(status_code=404, detail="No project summaries found")

    return {
        "filters": {
            "country_code": country_code,
            "source_name": source_name,
            "project_status": project_status,
            "limit": limit,
            "offset": offset,
        },
        "project_summaries": [_row_to_summary_payload(row) for row in rows],
    }


@api_router.get("/projects/{project_id}", summary="Get project summary by project ID")
def get_project_by_id(project_id: UUID):
    row = db_project_by_id(project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Project summary not found")
    return _row_to_summary_payload(row)
