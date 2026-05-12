"""City-level AdaptaBrasil climate risk endpoint."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")

ALLOWED_LEVELS = {"summary", "chain"}
DEFAULT_SCENARIO = "current"


def _value_status_from_null_type(null_type: str | None) -> str:
    """Map null semantics from storage into API-facing value status."""
    if null_type == "data_gap_null":
        return "data_unavailable"
    return "ok"


def _default_timeframe(actor_id: str, scenario: str) -> int | None:
    """Return the latest timeframe available for a city and scenario."""
    with SessionLocal() as session:
        query = text(
            """
            SELECT MAX(timeframe) AS timeframe
            FROM modelled.city_adapta_risk_fact
            WHERE actor_id = :actor_id
              AND source_dataset = 'br-mcti/adaptabrasil'
              AND scenario = :scenario
            """
        )
        result = session.execute(query, {"actor_id": actor_id, "scenario": scenario}).mappings().first()
        return result["timeframe"] if result else None


def db_city_adapta_risk_fact(actor_id: str, timeframe: int, scenario: str, level: str):
    """Fetch AdaptaBrasil risk rows for one city and selection level."""
    level_columns = """
        r.impact_chain_id_1,
        r.impact_chain_name_1,
        r.impact_chain_id_2,
        r.impact_chain_name_2,
        r.impact_chain_id_3,
        r.impact_chain_name_3,
        r.base_indicator_id,
        r.base_indicator_name,
        r.base_indicator_level,
        r.impact_chain_1_value_numeric,
        r.impact_chain_1_value_string,
        r.impact_chain_2_value_numeric,
        r.impact_chain_2_value_string,
        r.impact_chain_3_value_numeric,
        r.impact_chain_3_value_string,
        r.base_indicator_value_numeric,
        r.base_indicator_value_string
    """
    if level == "summary":
        level_columns = """
            NULL::INTEGER AS impact_chain_id_1,
            NULL::TEXT AS impact_chain_name_1,
            NULL::INTEGER AS impact_chain_id_2,
            NULL::TEXT AS impact_chain_name_2,
            NULL::INTEGER AS impact_chain_id_3,
            NULL::TEXT AS impact_chain_name_3,
            NULL::INTEGER AS base_indicator_id,
            NULL::TEXT AS base_indicator_name,
            NULL::INTEGER AS base_indicator_level,
            NULL::NUMERIC AS impact_chain_1_value_numeric,
            NULL::TEXT AS impact_chain_1_value_string,
            NULL::NUMERIC AS impact_chain_2_value_numeric,
            NULL::TEXT AS impact_chain_2_value_string,
            NULL::NUMERIC AS impact_chain_3_value_numeric,
            NULL::TEXT AS impact_chain_3_value_string,
            NULL::NUMERIC AS base_indicator_value_numeric,
            NULL::TEXT AS base_indicator_value_string
        """

    with SessionLocal() as session:
        query = text(
            f"""
            SELECT
                r.actor_id,
                r.city_name,
                r.country_code,
                r.timeframe,
                r.scenario,
                r.scenario_family,
                r.sector_id,
                r.sector_name,
                r.risk_id,
                r.risk_name,
                r.risk_component_id,
                r.risk_component_name,
                {level_columns},
                r.risk_value_numeric,
                r.risk_value_string,
                r.risk_component_value_numeric,
                r.risk_component_value_string,
                r.null_type,
                r.release_id,
                r.source_dataset,
                r.release_version,
                r.source_vintage,
                r.spatial_support_level
            FROM modelled.city_adapta_risk_fact r
            WHERE r.actor_id = :actor_id
              AND r.timeframe = :timeframe
              AND r.scenario = :scenario
              AND r.source_dataset = 'br-mcti/adaptabrasil'
            ORDER BY
                r.sector_id NULLS LAST,
                r.risk_id NULLS LAST,
                r.risk_component_id NULLS LAST,
                r.impact_chain_id_1 NULLS LAST,
                r.impact_chain_id_2 NULLS LAST,
                r.impact_chain_id_3 NULLS LAST,
                r.base_indicator_id NULLS LAST
            """
        )
        params = {"actor_id": actor_id, "timeframe": timeframe, "scenario": scenario}
        return session.execute(query, params).mappings().all()


@api_router.get(
    "/cities/{actor_id}/climate-risk/adapta",
    summary="Get AdaptaBrasil climate risk for one city",
)
def get_city_adapta_risk(
    actor_id: str,
    timeframe: int | None = None,
    scenario: str | None = None,
    level: str = "summary",
):
    """Return city AdaptaBrasil risk rows with summary or chain detail."""
    selected_scenario = scenario or DEFAULT_SCENARIO
    selected_level = level.lower()

    if selected_level not in ALLOWED_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level. Use 'summary' or 'chain'.")

    selected_timeframe = timeframe
    if selected_timeframe is None:
        selected_timeframe = _default_timeframe(actor_id, selected_scenario)
        if selected_timeframe is None:
            raise HTTPException(status_code=404, detail="No data available")

    records = db_city_adapta_risk_fact(
        actor_id=actor_id,
        timeframe=selected_timeframe,
        scenario=selected_scenario,
        level=selected_level,
    )

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    first = records[0]
    meta = {
        "actor_id": first["actor_id"],
        "city_name": first["city_name"],
        "country_code": first["country_code"],
        "timeframe": first["timeframe"],
        "scenario": first["scenario"],
        "scenario_family": first["scenario_family"],
        "level": selected_level,
        "source_dataset": first["source_dataset"],
        "release_id": str(first["release_id"]) if first["release_id"] is not None else None,
        "release_version": first["release_version"],
        "source_vintage": first["source_vintage"],
        "methodology_version": "v1",
    }

    data = []
    for record in records:
        item = {
            "sector_id": record["sector_id"],
            "sector_name": record["sector_name"],
            "risk_id": record["risk_id"],
            "risk_name": record["risk_name"],
            "risk_component_id": record["risk_component_id"],
            "risk_component_name": record["risk_component_name"],
            "risk_value_numeric": record["risk_value_numeric"],
            "risk_value_string": record["risk_value_string"],
            "risk_component_value_numeric": record["risk_component_value_numeric"],
            "risk_component_value_string": record["risk_component_value_string"],
            "null_type": record["null_type"],
            "value_status": _value_status_from_null_type(record["null_type"]),
            "spatial_support_level": record["spatial_support_level"],
        }
        if selected_level == "chain":
            item.update(
                {
                    "impact_chain_id_1": record["impact_chain_id_1"],
                    "impact_chain_name_1": record["impact_chain_name_1"],
                    "impact_chain_id_2": record["impact_chain_id_2"],
                    "impact_chain_name_2": record["impact_chain_name_2"],
                    "impact_chain_id_3": record["impact_chain_id_3"],
                    "impact_chain_name_3": record["impact_chain_name_3"],
                    "base_indicator_id": record["base_indicator_id"],
                    "base_indicator_name": record["base_indicator_name"],
                    "base_indicator_level": record["base_indicator_level"],
                    "impact_chain_1_value_numeric": record["impact_chain_1_value_numeric"],
                    "impact_chain_1_value_string": record["impact_chain_1_value_string"],
                    "impact_chain_2_value_numeric": record["impact_chain_2_value_numeric"],
                    "impact_chain_2_value_string": record["impact_chain_2_value_string"],
                    "impact_chain_3_value_numeric": record["impact_chain_3_value_numeric"],
                    "impact_chain_3_value_string": record["impact_chain_3_value_string"],
                    "base_indicator_value_numeric": record["base_indicator_value_numeric"],
                    "base_indicator_value_string": record["base_indicator_value_string"],
                }
            )
        data.append(item)

    return {"meta": meta, "data": data}
