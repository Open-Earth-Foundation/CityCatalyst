"""v2 finance endpoint - reference test using dependency overrides.

This is the template for testing a v2 endpoint. Two things make it sturdier than the
legacy tests:

  1. The DB is swapped with app.dependency_overrides[get_session] - NOT by patching a
     string like "routes.legacy.x.SessionLocal". Overrides don't care where the module
     lives, so moving files never breaks these tests.

  2. The endpoint is mounted in a tiny standalone app from v2_router alone, so a version
     can be tested in isolation without depending on how main.py wires things together.

The fake-row shapes are reused from the legacy finance test, so both versions are driven
by the same fixture data - which is exactly what lets you trust a v1->v2 migration.
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from db.dependencies import get_session
from routes.v2 import v2_router

RELEASE_ID = uuid4()

# What db.provenance.build_datasources() returns (also covers resolve_release_ids,
# which only reads release_id).
_PROVENANCE_ROW = {
    "release_id": RELEASE_ID,
    "datasource_name": "cl-mma-fondos",
    "publisher_name": "Ministerio del Medio Ambiente (MMA)",
    "publisher_url": "https://mma.gob.cl",
    "dataset_name": "Fondos concursables MMA",
    "dataset_url": "https://fondos.mma.gob.cl",
    "version_label": "v1",
    "is_latest": True,
}

# A row from modelled.finance_opportunity.
_OPP_ROW = {
    "release_id": RELEASE_ID,
    "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos",
    "funder_name": "Ministerio del Medio Ambiente (MMA)",
    "instrument": "grant",
    "eligible_actor": ["community_org"],
    "status": "closed",
    "amount": Decimal("6000000"),
    "amount_currency": "CLP",
    "amount_note": None,
    "source_url": "https://fondos.mma.gob.cl/fpa-2026/",
}


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    """Returns opp rows for the fact query, provenance rows for everything else."""

    def __init__(self, opp_rows=None, prov_rows=None):
        self._opp = _OPP_ROW if opp_rows is None else opp_rows
        self._prov = _PROVENANCE_ROW if prov_rows is None else prov_rows

    def execute(self, query, params=None):
        sql = str(query)
        if "finance_opportunity" in sql:
            return _Result(list(self._opp) if isinstance(self._opp, list) else [self._opp])
        return _Result(list(self._prov) if isinstance(self._prov, list) else [self._prov])


def _make_client(session) -> TestClient:
    app = FastAPI()
    # v2_router is prefix-less; the wiring supplies /api/v2 (in production it's the mount point).
    app.include_router(v2_router, prefix="/api/v2")
    app.dependency_overrides[get_session] = lambda: session   # swap the DB, no monkeypatch
    return TestClient(app)


def test_finance_opportunities_v2_contract():
    client = _make_client(_FakeSession())
    resp = client.get("/api/v2/climate-finance/opportunities", params={"country_code": "CL"})

    assert resp.status_code == 200
    body = resp.json()

    # envelope shape
    assert body["meta"]["count"] == 1
    assert body["meta"]["endpoint"].endswith("/climate-finance/opportunities")

    record = body["data"][0]
    # camelCase keys prove the alias generator is applied
    assert "opportunityName" in record
    # amount travels WITH its currency as one object
    assert record["amount"] == {"value": 6000000, "currency": "CLP", "note": None}
    # provenance is a typed object resolved from the release, not a bare string
    assert record["provenance"]["datasourceName"] == "cl-mma-fondos"
    assert record["provenance"]["versionLabel"] == "v1"


def test_finance_opportunities_v2_404_when_no_releases():
    # No releases resolved -> the endpoint should 404, per api-design.md error rules.
    client = _make_client(_FakeSession(prov_rows=[]))
    resp = client.get("/api/v2/climate-finance/opportunities", params={"country_code": "CL"})
    assert resp.status_code == 404
