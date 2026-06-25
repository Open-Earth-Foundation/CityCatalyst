"""Standard datasource provenance for API responses.

Every record served from a ``modelled.*`` fact table carries a ``release_id``
(FK -> ``modelled.dataset_release``). This module turns those release ids into
the one canonical provenance block that goes in ``meta.datasources`` -- sourced
entirely from ``modelled.publisher_datasource`` + ``modelled.dataset_release``.

See engineering-standards/api-design.md ("Response Structure and Provenance").
The contract (apply to every route):

* Default response = the *latest* release of each datasource (``is_latest = true``).
* ``?release_id=<uuid>`` pins one exact release.
* ``?version_label=<v>`` pins a version across the datasource(s).
* Every object in ``data`` carries ``release_id`` (and optionally
  ``datasource_name``) so a consumer can map any record back to its source in
  ``meta.datasources``.

Typical use in a route::

    from db.provenance import resolve_release_ids, build_datasources

    release_ids = resolve_release_ids(
        session,
        datasource_names=["cl-mma-fondos", "cl-corfo-finance"],   # or None for all
        version_label=version_label,
        release_id=release_id,
    )
    if not release_ids:
        raise HTTPException(404, "No releases found")

    rows = session.execute(
        text("SELECT * FROM modelled.finance_opportunity "
             "WHERE release_id = ANY(:rids) ORDER BY opportunity_name"),
        {"rids": release_ids},
    ).mappings().all()

    used = [r["release_id"] for r in rows]            # only sources actually returned
    return {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "filters": {...},
            "count": len(rows),
            "datasources": build_datasources(session, used or release_ids),
        },
        "data": [dict(r) for r in rows],              # each row already has release_id
    }
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional
from uuid import UUID

from sqlalchemy import text

__all__ = ["resolve_release_ids", "build_datasources", "provenance_for_rows"]


def resolve_release_ids(
    session,
    *,
    datasource_names: Optional[Iterable[str]] = None,
    version_label: Optional[str] = None,
    release_id: Optional[UUID | str] = None,
) -> List[str]:
    """Return the release ids a route should query, per the resolution contract.

    Precedence: explicit ``release_id`` > ``version_label`` > latest.
    ``datasource_names`` scopes the result to specific datasources (by
    ``publisher_datasource.datasource_name``); pass ``None`` for no scope.
    """
    names = list(datasource_names) if datasource_names is not None else None

    if release_id is not None:
        row = session.execute(
            text(
                "SELECT release_id FROM modelled.dataset_release "
                "WHERE release_id = CAST(:rid AS uuid)"
            ),
            {"rid": str(release_id)},
        ).mappings().first()
        return [str(row["release_id"])] if row else []

    clauses = ["pd.datasource_name = ANY(:names)"] if names is not None else []
    if version_label is not None:
        clauses.append("dr.version_label = :version_label")
    else:
        clauses.append("dr.is_latest = true")
    where = " AND ".join(clauses)

    rows = session.execute(
        text(
            f"""
            SELECT dr.release_id
            FROM modelled.dataset_release dr
            JOIN modelled.publisher_datasource pd
              ON pd.publisher_id = dr.publisher_id
             AND pd.dataset_id   = dr.dataset_id
            WHERE {where}
            ORDER BY pd.datasource_name
            """
        ),
        {"names": names, "version_label": version_label},
    ).mappings().all()
    return [str(r["release_id"]) for r in rows]


def build_datasources(session, release_ids: Iterable[str]) -> List[Dict[str, Any]]:
    """Return the canonical provenance objects for the given release ids.

    De-duplicates and preserves a stable order (by datasource_name). Flat shape::

        {
          "release_id": "...",
          "datasource_name": "cl-mma-fondos",
          "publisher_name": "...",
          "publisher_url": "...",
          "dataset_name": "...",
          "dataset_url": "...",
          "version_label": "v1",
          "is_latest": true
        }
    """
    ids = sorted({str(r) for r in release_ids})
    if not ids:
        return []

    rows = session.execute(
        text(
            """
            SELECT
                dr.release_id,
                pd.datasource_name,
                pd.publisher_name,
                pd.publisher_url,
                pd.dataset_name,
                pd.dataset_url,
                dr.version_label,
                dr.is_latest
            FROM modelled.dataset_release dr
            JOIN modelled.publisher_datasource pd
              ON pd.publisher_id = dr.publisher_id
             AND pd.dataset_id   = dr.dataset_id
            WHERE dr.release_id = ANY(CAST(:ids AS uuid[]))
            ORDER BY pd.datasource_name, dr.version_label
            """
        ),
        {"ids": ids},
    ).mappings().all()

    return [
        {
            "release_id": str(r["release_id"]),
            "datasource_name": r["datasource_name"],
            "publisher_name": r["publisher_name"],
            "publisher_url": r["publisher_url"],
            "dataset_name": r["dataset_name"],
            "dataset_url": r["dataset_url"],
            "version_label": r["version_label"],
            "is_latest": r["is_latest"],
        }
        for r in rows
    ]


def provenance_for_rows(session, rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convenience: build the datasources block from whatever rows were returned.

    Reads ``release_id`` off each row, so ``meta.datasources`` lists only the
    sources actually represented in ``data``.
    """
    return build_datasources(
        session, [r["release_id"] for r in rows if r.get("release_id") is not None]
    )
