from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v1")


def _validate_publication_assets(record):
    assets = record.get("assets")
    data_type = record.get("data_type")

    if not isinstance(assets, dict):
        raise HTTPException(status_code=500, detail="Invalid assets payload for publication")

    if data_type == "raster":
        if not assets.get("cog_url"):
            raise HTTPException(
                status_code=500,
                detail="Invalid assets payload for raster publication",
            )
        return

    if data_type == "vector":
        if not assets.get("tiles_visual_base"):
            raise HTTPException(
                status_code=500,
                detail="Invalid assets payload for vector publication",
            )
        return

    if not (assets.get("cog_url") or assets.get("tiles_visual_base")):
        raise HTTPException(
            status_code=500,
            detail="Invalid assets payload for publication",
        )


def _catalog_projection(include: str) -> str:
    if include == "full":
        return "c.*"
    return """
        c.layer_input_id,
        c.layer_name,
        c.layer_type,
        c.category,
        c.dataset_id,
        c.release_id,
        c.spatial_resolution,
        c.crs,
        c.license
    """


def _publication_projection() -> str:
    return """
        p.publication_id,
        p.layer_input_id,
        p.city_id,
        p.bbox,
        p.version_label,
        p.release_id,
        p.data_type,
        p.published_format,
        p.resolution_m,
        p.assets,
        p.processing_repo_commit,
        p.methodology_note,
        p.published_at,
        p.created_at,
        p.updated_at,
        c.name AS layer_name,
        c.layer_type,
        c.category,
        c.dataset_id,
        c.release_id AS catalog_release_id,
        c.spatial_resolution,
        c.crs,
        c.license
    """


@api_router.get("/nbs/geospatial-catalog/layers", summary="List NBS geospatial catalog layers")
def get_nbs_geospatial_catalog_layers(
    layer_type: Optional[str] = None,
    category: Optional[str] = None,
    dataset_id: Optional[str] = None,
    release_id: Optional[str] = None,
    q: Optional[str] = None,
    include: str = Query(default="thin", pattern="^(thin|full)$"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    where = ["1=1"]
    params = {"limit": limit, "offset": offset}

    if layer_type:
        where.append("c.layer_type = :layer_type")
        params["layer_type"] = layer_type
    if category:
        where.append("c.category = :category")
        params["category"] = category
    if dataset_id:
        where.append("c.dataset_id::text = :dataset_id")
        params["dataset_id"] = dataset_id
    if release_id:
        where.append("c.release_id::text = :release_id")
        params["release_id"] = release_id
    if q:
        where.append("(c.name ILIKE :q OR COALESCE(c.brief_description, '') ILIKE :q)")
        params["q"] = f"%{q}%"

    query = text(
        f"""
        SELECT
            {_catalog_projection(include)}
        FROM modelled.nbs_geospatial_catalog c
        WHERE {" AND ".join(where)}
        ORDER BY c.name ASC
        LIMIT :limit OFFSET :offset;
        """
    )

    with SessionLocal() as session:
        rows = session.execute(query, params).mappings().all()

    return {"layers": rows}


@api_router.get(
    "/nbs/geospatial-catalog/layers/{layer_input_id}",
    summary="Get a single NBS geospatial catalog layer",
)
def get_nbs_geospatial_catalog_layer(layer_input_id: str):
    query = text(
        """
        SELECT c.*
        FROM modelled.nbs_geospatial_catalog c
        WHERE c.layer_input_id::text = :layer_input_id
        LIMIT 1;
        """
    )

    with SessionLocal() as session:
        row = session.execute(query, {"layer_input_id": layer_input_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Catalog layer not found")

    return row


@api_router.get(
    "/nbs/geospatial-publications/cities/{city_id}/layers",
    summary="List NBS geospatial publications by city",
)
def get_nbs_geospatial_publications_by_city(
    city_id: str,
    latest: bool = True,
    data_type: Optional[str] = None,
    layer_type: Optional[str] = None,
    category: Optional[str] = None,
):
    where = ["p.city_id = :city_id"]
    params = {"city_id": city_id}

    if data_type:
        where.append("p.data_type = :data_type")
        params["data_type"] = data_type
    if layer_type:
        where.append("c.layer_type = :layer_type")
        params["layer_type"] = layer_type
    if category:
        where.append("c.category = :category")
        params["category"] = category

    if latest:
        query = text(
            f"""
            WITH ranked AS (
                SELECT
                    {_publication_projection()},
                    ROW_NUMBER() OVER (
                        PARTITION BY p.layer_input_id
                        ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.created_at DESC
                    ) AS rn
                FROM modelled.nbs_layer_publication p
                JOIN modelled.nbs_geospatial_catalog c
                  ON c.layer_input_id = p.layer_input_id
                WHERE {" AND ".join(where)}
            )
            SELECT *
            FROM ranked
            WHERE rn = 1
            ORDER BY layer_name ASC;
            """
        )
    else:
        query = text(
            f"""
            SELECT
                {_publication_projection()}
            FROM modelled.nbs_layer_publication p
            JOIN modelled.nbs_geospatial_catalog c
              ON c.layer_input_id = p.layer_input_id
            WHERE {" AND ".join(where)}
            ORDER BY p.layer_input_id, COALESCE(p.published_at, p.created_at) DESC;
            """
        )

    with SessionLocal() as session:
        rows = session.execute(query, params).mappings().all()

    for row in rows:
        _validate_publication_assets(row)

    return {"publications": rows}


@api_router.get(
    "/nbs/geospatial-publications/cities/{city_id}/layers/{layer_input_id}/assets",
    summary="Get NBS publication assets for a city/layer",
)
def get_nbs_layer_assets(
    city_id: str,
    layer_input_id: str,
    latest: bool = True,
    version_label: Optional[str] = None,
    release_id: Optional[str] = None,
):
    selectors = [value is not None for value in [version_label, release_id]]

    if latest and any(selectors):
        raise HTTPException(
            status_code=400,
            detail="Use latest=true or one of version_label/release_id, not both",
        )

    if version_label and release_id:
        raise HTTPException(
            status_code=400,
            detail="Use either version_label or release_id, not both",
        )

    if not latest and not any(selectors):
        raise HTTPException(
            status_code=400,
            detail="When latest=false, provide version_label or release_id",
        )

    params = {"city_id": city_id, "layer_input_id": layer_input_id}
    where = [
        "p.city_id = :city_id",
        "p.layer_input_id::text = :layer_input_id",
    ]

    if version_label:
        where.append("p.version_label = :version_label")
        params["version_label"] = version_label
    if release_id:
        where.append("p.release_id::text = :release_id")
        params["release_id"] = release_id

    if latest:
        query = text(
            f"""
            SELECT
                {_publication_projection()}
            FROM modelled.nbs_layer_publication p
            JOIN modelled.nbs_geospatial_catalog c
              ON c.layer_input_id = p.layer_input_id
            WHERE {" AND ".join(where)}
            ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.created_at DESC
            LIMIT 1;
            """
        )
    else:
        query = text(
            f"""
            SELECT
                {_publication_projection()}
            FROM modelled.nbs_layer_publication p
            JOIN modelled.nbs_geospatial_catalog c
              ON c.layer_input_id = p.layer_input_id
            WHERE {" AND ".join(where)}
            ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.created_at DESC
            LIMIT 1;
            """
        )

    with SessionLocal() as session:
        row = session.execute(query, params).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="No publication exists for requested city/layer/version",
        )

    _validate_publication_assets(row)
    return row


@api_router.get(
    "/nbs/geospatial-publications/layers/{layer_input_id}/publications",
    summary="List all NBS publications for a layer",
)
def list_nbs_publications_for_layer(
    layer_input_id: str,
    city_id: Optional[str] = None,
    release_id: Optional[str] = None,
):
    where = ["p.layer_input_id::text = :layer_input_id"]
    params = {"layer_input_id": layer_input_id}

    if city_id:
        where.append("p.city_id = :city_id")
        params["city_id"] = city_id
    if release_id:
        where.append("p.release_id::text = :release_id")
        params["release_id"] = release_id

    query = text(
        f"""
        SELECT
            {_publication_projection()}
        FROM modelled.nbs_layer_publication p
        JOIN modelled.nbs_geospatial_catalog c
          ON c.layer_input_id = p.layer_input_id
        WHERE {" AND ".join(where)}
        ORDER BY p.city_id ASC, COALESCE(p.published_at, p.created_at) DESC;
        """
    )

    with SessionLocal() as session:
        rows = session.execute(query, params).mappings().all()

    for row in rows:
        _validate_publication_assets(row)

    return {"publications": rows}


@api_router.get(
    "/nbs/geospatial-publications/publications/{publication_id}",
    summary="Get single NBS publication by ID",
)
def get_nbs_publication_by_id(publication_id: str):
    query = text(
        f"""
        SELECT
            {_publication_projection()}
        FROM modelled.nbs_layer_publication p
        JOIN modelled.nbs_geospatial_catalog c
          ON c.layer_input_id = p.layer_input_id
        WHERE p.publication_id::text = :publication_id
        LIMIT 1;
        """
    )

    with SessionLocal() as session:
        row = session.execute(query, {"publication_id": publication_id}).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Publication not found")

    _validate_publication_assets(row)
    return row
