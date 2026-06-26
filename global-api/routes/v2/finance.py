"""GET /api/v2/climate-finance/opportunities - v2 reference migration.

Same data, same query, same provenance helpers as routes/legacy/finance_opportunities.py.
The ONLY thing that changes is the contract:

  legacy                              v2
  --------------------------------    ------------------------------------------------
  hand-built dict                ->   typed Envelope[...] via response_model
  snake_case keys                ->   camelCase (from the Pydantic alias generator)
  amount + amount_currency loose ->   amount: { value, currency } as one object
  datasource_name string         ->   provenance: typed Provenance object
  nothing shown in /docs         ->   full shape auto-documented in /api/v2/docs
  with SessionLocal() inside      ->   session injected via Depends(get_session)

That last change is what makes this endpoint testable with app.dependency_overrides -
no string-path monkeypatching. There is also NO prefix on this router; the version
package (routes/v2/__init__.py) applies /api/v2 once.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from db.dependencies import get_session
from db.provenance import resolve_release_ids, build_datasources
from schemas.v2 import Envelope, Meta, MonetaryAmount, Provenance, _Base

api_router = APIRouter()  # version prefix is set once in routes/v2/__init__.py


class FinanceOpportunity(_Base):
    """One funding opportunity. A representative subset of modelled.finance_opportunity -
    the remaining curated fields follow the same pattern. The teaching points are `amount`
    (a value bound to its currency) and `provenance` (a typed object, not a bare string)."""
    opportunity_name: Optional[str] = None
    funder_name: Optional[str] = None
    instrument: Optional[str] = None
    eligible_actor: Optional[Any] = None
    status: Optional[str] = None
    amount: MonetaryAmount                        # was: amount="6000000", amount_currency="CLP"
    source_url: Optional[str] = None
    provenance: Provenance                         # was: datasource_name (a bare string)


def _num(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _row_to_opportunity(row: dict, prov_by_release: dict[str, Provenance]) -> FinanceOpportunity:
    return FinanceOpportunity(
        opportunity_name=row.get("opportunity_name"),
        funder_name=row.get("funder_name"),
        instrument=row.get("instrument"),
        eligible_actor=row.get("eligible_actor"),
        status=row.get("status"),
        amount=MonetaryAmount(
            value=_num(row.get("amount")),
            currency=row.get("amount_currency"),
            note=row.get("amount_note"),
        ),
        source_url=row.get("source_url"),
        provenance=prov_by_release[str(row["release_id"])],
    )


@api_router.get(
    "/climate-finance/opportunities",
    summary="List climate-finance opportunities",
    response_model=Envelope[list[FinanceOpportunity]],   # <-- enforces AND documents the shape
)
def list_finance_opportunities(
    country_code: Optional[str] = Query(default="CL"),
    sector: Optional[str] = Query(default=None, description="GPC sector, e.g. stationary_energy"),
    eligible_actor: Optional[str] = Query(default=None, description="who can apply, e.g. municipality"),
    status: Optional[str] = Query(default=None, description="open | closed | rolling"),
    version_label: Optional[str] = Query(default=None, description="pin a release version, e.g. v1"),
    release_id: Optional[UUID] = Query(default=None, description="pin one exact release"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session=Depends(get_session),                 # <-- injected; overridable in tests
):
    # --- same data path as legacy, but using the injected session ---
    release_ids = resolve_release_ids(
        session, datasource_names=None, version_label=version_label, release_id=release_id
    )
    if not release_ids:
        raise HTTPException(status_code=404, detail="No dataset releases found")

    rows = session.execute(
        text(
            """
            SELECT fo.*
            FROM modelled.finance_opportunity fo
            WHERE fo.release_id = ANY(CAST(:release_ids AS uuid[]))
              AND (:country_code IS NULL OR fo.country_code = :country_code)
              AND (:sector IS NULL OR fo.gpc_sectors ? :sector)
              AND (:eligible_actor IS NULL OR fo.eligible_actor ? :eligible_actor)
              AND (:status IS NULL OR fo.status = :status)
            ORDER BY fo.opportunity_name
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "release_ids": release_ids, "country_code": country_code, "sector": sector,
            "eligible_actor": eligible_actor, "status": status, "limit": limit, "offset": offset,
        },
    ).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No finance opportunities found")

    used_release_ids = {str(r["release_id"]) for r in rows}
    datasources = build_datasources(session, used_release_ids)

    # Typed provenance, keyed by release for per-record attachment.
    prov_by_release = {d["release_id"]: Provenance(**d) for d in datasources}

    return Envelope[list[FinanceOpportunity]](
        meta=Meta(
            generated_at_utc=datetime.now(timezone.utc),
            endpoint="GET /api/v2/climate-finance/opportunities",
            request={
                "country_code": country_code, "sector": sector, "eligible_actor": eligible_actor,
                "status": status, "version_label": version_label,
                "release_id": str(release_id) if release_id else None,
                "limit": limit, "offset": offset,
            },
            count=len(rows),
            datasources=list(prov_by_release.values()),
        ),
        data=[_row_to_opportunity(r, prov_by_release) for r in rows],
    )
