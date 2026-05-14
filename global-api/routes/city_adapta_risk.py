"""City-level AdaptaBrasil climate risk endpoint."""

from fastapi import APIRouter, HTTPException, Query
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


def _has_any_adapta_rows(actor_id: str, scenario: str) -> bool:
    with SessionLocal() as session:
        q = text(
            """
            SELECT 1
            FROM modelled.city_adapta_risk_fact r
            WHERE r.actor_id = :actor_id
              AND r.scenario = :scenario
              AND r.source_dataset = 'br-mcti/adaptabrasil'
            LIMIT 1
            """
        )
        return session.execute(q, {"actor_id": actor_id, "scenario": scenario}).first() is not None


def db_city_adapta_risk_fact(
    actor_id: str,
    timeframe: int | None,
    scenario: str,
    level: str,
    merge_across_timeframes: bool = False,
):
    """Fetch AdaptaBrasil risk rows for one city and selection level.

    Storage grain is one row per impact-chain / base-indicator leaf. For ``summary``,
    those dimensions are omitted from the response, so we collapse rows that share the
    same sector, risk, and risk component (otherwise identical summary payloads repeat).

    When ``merge_across_timeframes`` is true (``summary`` only), rows from every
    ``timeframe`` are considered for the requested ``scenario``; for each
    ``(sector_id, risk_id, risk_component_id)`` the row from the **latest**
    ``timeframe`` present in the table is returned so the union of risks matches
    a dataframe filtered by city and scenario only (no year filter).
    """
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

    # One summary row per (sector, risk, component); pick a deterministic leaf row.
    # When merging years, order by timeframe DESC so DISTINCT ON keeps the latest year.
    distinct_prefix = (
        "DISTINCT ON (r.sector_id, r.risk_id, r.risk_component_id) "
        if level == "summary"
        else ""
    )

    time_filter = "" if merge_across_timeframes else "AND r.timeframe = :timeframe"
    order_timeframe = "r.timeframe DESC NULLS LAST,\n                " if level == "summary" else ""

    with SessionLocal() as session:
        query = text(
            f"""
            SELECT {distinct_prefix}
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
              {time_filter}
              AND r.scenario = :scenario
              AND r.source_dataset = 'br-mcti/adaptabrasil'
            ORDER BY
                r.sector_id NULLS LAST,
                r.risk_id NULLS LAST,
                r.risk_component_id NULLS LAST,
                {order_timeframe}r.impact_chain_id_1 NULLS LAST,
                r.impact_chain_id_2 NULLS LAST,
                r.impact_chain_id_3 NULLS LAST,
                r.base_indicator_id NULLS LAST
            """
        )
        params: dict = {"actor_id": actor_id, "scenario": scenario}
        if not merge_across_timeframes:
            params["timeframe"] = timeframe
        return session.execute(query, params).mappings().all()


@api_router.get(
    "/cities/{actor_id}/climate-risk/adapta",
    summary="Get AdaptaBrasil climate risk for one city",
)
def get_city_adapta_risk(
    actor_id: str,
    timeframe: int | None = Query(
        None,
        description=(
            "Reference year in the fact table. When omitted with level `summary`, "
            "rows from all years are merged for the chosen scenario: each "
            "(sector, risk, component) uses values from the latest year that has "
            "data for that slot (meta.timeframe is null). When omitted with level "
            "`chain`, the latest single year (MAX(timeframe)) is used. Pass "
            "timeframe explicitly to pin one year."
        ),
    ),
    scenario: str | None = None,
    level: str = "summary",
):
    """Return city AdaptaBrasil risk rows with summary or chain detail."""
    selected_scenario = scenario or DEFAULT_SCENARIO
    selected_level = level.lower()

    if selected_level not in ALLOWED_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid level. Use 'summary' or 'chain'.")

    merge_summary_across_timeframes = timeframe is None and selected_level == "summary"

    selected_timeframe: int | None = timeframe
    if merge_summary_across_timeframes:
        if not _has_any_adapta_rows(actor_id, selected_scenario):
            raise HTTPException(status_code=404, detail="No data available")
    else:
        if selected_timeframe is None:
            selected_timeframe = _default_timeframe(actor_id, selected_scenario)
            if selected_timeframe is None:
                raise HTTPException(status_code=404, detail="No data available")

    records = db_city_adapta_risk_fact(
        actor_id=actor_id,
        timeframe=selected_timeframe,
        scenario=selected_scenario,
        level=selected_level,
        merge_across_timeframes=merge_summary_across_timeframes,
    )

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    first = records[0]
    meta = {
        "actor_id": first["actor_id"],
        "city_name": first["city_name"],
        "country_code": first["country_code"],
        "timeframe": None if merge_summary_across_timeframes else first["timeframe"],
        "scenario": first["scenario"],
        "scenario_family": first["scenario_family"],
        "level": selected_level,
        "source_dataset": first["source_dataset"],
        "release_id": str(first["release_id"]) if first["release_id"] is not None else None,
        "release_version": first["release_version"],
        "source_vintage": first["source_vintage"],
        "methodology_version": "v1",
        "timeframe_resolution": (
            "latest_year_per_sector_risk_component"
            if merge_summary_across_timeframes
            else "single_year"
        ),
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
