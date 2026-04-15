from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")


def db_city_attributes(locode: str, version_label: Optional[str]):
    """
    Fetch all city_attribute rows for a locode, joined to their respective
    publisher / release metadata.

    When version_label is None the query returns each datasource's latest
    release (is_latest = true).  When a version_label is supplied it filters
    every datasource to that label, returning only attributes that have a
    matching release.

    The release filter is expressed entirely as bind parameters — no
    string interpolation — so the query is safe from SQL injection.
    """
    with SessionLocal() as session:
        query = text(
            """
            SELECT
                cp.locode,
                cp.city_name,
                cp.country_code,
                cp.region_code,
                ROUND(ST_Area(ST_Transform(ST_SetSRID(cp.geometry, 4326), 3857)) / 1000000) AS area_km2,
                a.region_name,
                a.attribute_type,
                a.attribute_value::numeric  AS attribute_value,
                a.attribute_units,
                a.attribute_category,
                a.datasource,
                pd.publisher_name,
                pd.publisher_url,
                pd.dataset_name,
                pd.dataset_url,
                dr.version_label,
                dr.released_at,
                dr.source_url,
                dr.is_latest
            FROM modelled.city_polygon cp
            JOIN modelled.city_attribute a
                ON a.locode = cp.locode
            JOIN modelled.publisher_datasource pd
                ON pd.datasource_name = a.datasource
            JOIN modelled.dataset_release dr
                ON dr.dataset_id = pd.dataset_id
                AND (
                    (:version_label IS NULL     AND dr.is_latest = true)
                    OR
                    (:version_label IS NOT NULL AND dr.version_label = :version_label)
                )
            WHERE cp.locode = :locode
            ORDER BY a.attribute_type, a.datasource
            """
        )

        result = session.execute(
            query,
            {"locode": locode, "version_label": version_label},
        ).mappings().all()

    return result


@api_router.get(
    "/city_attributes/{locode}",
    summary="Get city attributes for a Chilean city",
)
def get_city_attributes(
    locode: str,
    version_label: Optional[str] = Query(
        default=None,
        description=(
            "Return attributes from this specific release version "
            "(e.g. '2024'). Omit to get each datasource's latest release."
        ),
    ),
):
    """
    Return all city_attribute records for the given locode, sourced from
    every available datasource.

    - Omit `version_label` to get the current (latest) release from each
      datasource.
    - Pass `version_label=2024` (or any label) to pin to a specific version;
      only attributes that have a release with that label are returned.

    Each attribute carries its own `datasource` and `version_label` so
    consumers know exactly where each value came from.  All datasources
    used by the response are summarised in `meta.datasources`.
    """
    records = db_city_attributes(locode, version_label)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    first = records[0]

    # Build per-attribute values — include datasource provenance on each one.
    # If two sources supply the same attribute_type the last one (alphabetically
    # by datasource) wins as the top-level key; both are visible in
    # meta.datasources so consumers can query more specifically if needed.
    attributes: dict = {}
    for row in records:
        released_at = row["released_at"]
        if hasattr(released_at, "isoformat"):
            released_at = released_at.isoformat()

        attributes[row["attribute_type"]] = {
            "attribute_value": (
                float(row["attribute_value"])
                if row["attribute_value"] is not None
                else None
            ),
            "attribute_units": row["attribute_units"],
            "attribute_category": row["attribute_category"],
            "datasource": row["datasource"],
            "version_label": row["version_label"],
        }

    # Collect unique datasource metadata entries for meta block.
    seen: set = set()
    datasources: list = []
    for row in records:
        key = (row["datasource"], row["version_label"])
        if key in seen:
            continue
        seen.add(key)

        released_at = row["released_at"]
        if hasattr(released_at, "isoformat"):
            released_at = released_at.isoformat()

        datasources.append(
            {
                "datasource_name": row["datasource"],
                "publisher_name": row["publisher_name"],
                "publisher_url": row["publisher_url"],
                "dataset_name": row["dataset_name"],
                "dataset_url": row["dataset_url"],
                "version_label": row["version_label"],
                "released_at": released_at,
                "source_url": row["source_url"],
                "is_latest": row["is_latest"],
            }
        )

    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "api_context": {
                "endpoint": "GET /api/v0/city_attributes/{locode}",
                "locode": locode,
                "version_label": version_label,
            },
            "datasources": datasources,
        },
        "city": {
            "locode": first["locode"],
            "city_name": first["city_name"],
            "country_code": first["country_code"],
            "region_code": first["region_code"],
            "region_name": first["region_name"],
            "area_km2": (
                int(first["area_km2"]) if first["area_km2"] is not None else None
            ),
            **attributes,
        },
    }
