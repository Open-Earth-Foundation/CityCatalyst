from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Optional

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


def _row_to_policy_signal_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "policy_signal_id": str(row["policy_signal_id"]),
        "location_code": row["location_code"],
        "location_name": row["location_name"],
        "location_scope": row["location_scope"],
        "signal_type": row["signal_type"],
        "signal_relation": row["signal_relation"],
        "signal_strength": row["signal_strength"],
        "signal_subject": row["signal_subject"],
        "gpc_sector": row["gpc_sector"],
        "signal_summary": row["signal_summary"],
        "key_numeric": _normalize_value(row["key_numeric"]),
        "evidence_anchors": _normalize_value(row["evidence_anchors"]),
        "release_id": str(row["release_id"]),
        "created_at": _normalize_value(row["created_at"]),
        "updated_at": _normalize_value(row["updated_at"]),
    }


def db_city_policy_signals(
    locode: str,
    signal_type: Optional[str],
    gpc_sector: Optional[str],
    limit: int,
    offset: int,
):
    with SessionLocal() as session:
        scope_query = text(
            """
            SELECT locode, region_code, country_code
            FROM modelled.city_polygon
            WHERE locode = :locode
            LIMIT 1
            """
        )
        scope_row = (
            session.execute(scope_query, {"locode": locode})
            .mappings()
            .first()
        )

        region_code = scope_row["region_code"] if scope_row else None
        country_code = scope_row["country_code"] if scope_row else None

        query = text(
            """
            SELECT
                policy_signal_id,
                location_code,
                location_name,
                location_scope,
                signal_type,
                signal_relation,
                signal_strength,
                signal_subject,
                gpc_sector,
                signal_summary,
                key_numeric,
                evidence_anchors,
                release_id,
                created_at,
                updated_at
            FROM modelled.policy_signals
            WHERE
                (
                    location_code = :locode
                    OR (:region_code IS NOT NULL AND location_code = :region_code)
                    OR (:country_code IS NOT NULL AND location_code = :country_code)
                )
                AND (:signal_type IS NULL OR signal_type = :signal_type)
                AND (:gpc_sector IS NULL OR gpc_sector = :gpc_sector)
            ORDER BY updated_at DESC, policy_signal_id
            LIMIT :limit
            OFFSET :offset
            """
        )

        return (
            session.execute(
                query,
                {
                    "locode": locode,
                    "region_code": region_code,
                    "country_code": country_code,
                    "signal_type": signal_type,
                    "gpc_sector": gpc_sector,
                    "limit": limit,
                    "offset": offset,
                },
            )
            .mappings()
            .all()
        )


@api_router.get("/cities/{locode}/policy-signals", summary="List policy signals for a city")
def get_city_policy_signals(
    locode: str,
    signal_type: Optional[str] = Query(default=None),
    gpc_sector: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = db_city_policy_signals(locode, signal_type, gpc_sector, limit, offset)
    if not rows:
        raise HTTPException(status_code=404, detail="No policy signals found")

    return {
        "filters": {
            "locode": locode,
            "signal_type": signal_type,
            "gpc_sector": gpc_sector,
            "limit": limit,
            "offset": offset,
        },
        "policy_signals": [_row_to_policy_signal_payload(row) for row in rows],
    }
