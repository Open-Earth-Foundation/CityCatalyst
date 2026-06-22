import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

from db.database import SessionLocal
from fastapi import APIRouter, Query
from sqlalchemy import text

api_router = APIRouter(prefix="/api/v1")

MAX_LIMIT = 50
DEFAULT_LIMIT = 20


def _normalize(value: str | None) -> str:
    """Return a lower-case ASCII search string with punctuation collapsed."""
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    lowered = without_accents.lower().strip()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", lowered)).strip()


def _score_city(query: str, city: dict[str, Any]) -> float:
    """Score a city result for autocomplete-style search ranking."""
    normalized_query = _normalize(query)
    normalized_name = _normalize(city.get("city_name"))
    normalized_locode = _normalize(city.get("locode"))

    if not normalized_query or not normalized_name:
        return 0

    name_score = SequenceMatcher(None, normalized_query, normalized_name).ratio()
    locode_score = SequenceMatcher(None, normalized_query, normalized_locode).ratio()
    score = max(name_score, locode_score * 0.85)

    if normalized_name == normalized_query or normalized_locode == normalized_query:
        score += 1.0
    elif normalized_name.startswith(normalized_query):
        score += 0.6
    elif normalized_query in normalized_name:
        score += 0.35

    return score


def db_search_cities(
    query: str,
    country_code: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    """Fetch city candidates from city_polygon and rank them in Python."""
    params: dict[str, Any] = {}
    where_sql = ""
    if country_code:
        params["country_code"] = country_code.upper()
        where_sql = "WHERE country_code = :country_code"

    with SessionLocal() as session:
        query_text = text(
            f"""
            SELECT
                city_id,
                city_name,
                city_type,
                country_code,
                region_code,
                locode,
                lat,
                lon,
                bbox_north,
                bbox_south,
                bbox_east,
                bbox_west
            FROM modelled.city_polygon
            {where_sql};
            """
        )
        rows = session.execute(query_text, params).mappings().all()

    scored_rows = []
    for row in rows:
        city = dict(row)
        score = _score_city(query, city)
        if score >= 0.45:
            city["score"] = round(score, 4)
            scored_rows.append(city)

    scored_rows.sort(key=lambda city: city["score"], reverse=True)
    return scored_rows[:limit]


@api_router.get("/cities/search", summary="Search supported cities")
def search_cities(
    q: str = Query(..., min_length=2, description="City name or locode search text."),
    country_code: str | None = Query(
        default=None,
        min_length=2,
        max_length=2,
        description="Optional ISO 3166-1 alpha-2 country filter.",
    ),
    limit: int = Query(
        default=DEFAULT_LIMIT,
        ge=1,
        le=MAX_LIMIT,
        description="Maximum number of cities to return.",
    ),
) -> dict[str, list[dict[str, Any]]]:
    """Search cities that are available in modelled.city_polygon."""
    records = db_search_cities(q, country_code, limit)
    return {"data": records}
