from datetime import date
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

RELEASE_ID = uuid4()

# Row returned by the provenance queries (resolve_release_ids + build_datasources):
# carries the columns build_datasources selects.
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

# Row returned by the finance_opportunity query: only the real table columns
# the route surfaces (see _FIELDS) plus release_id.
_OPP_ROW = {
    "release_id": RELEASE_ID,
    "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos",
    "funder_name": "Ministerio del Medio Ambiente (MMA)",
    "funder_level": None,
    "funder_channel": "competitive fund",
    "provider": None,
    "instrument": "grant",
    "gpc_sectors": ["waste", "stationary_energy", "afolu"],
    "eligible_actor": ["community_org"],
    "eligible_actor_detail": "non-profit private legal persons; NOT municipalities",
    "city_application": ["direct"],
    "funding_channel": "competitive fund",
    "access_tier": "competitive",
    "open_date": date(2025, 8, 26),
    "close_date": date(2025, 10, 7),
    "status": "closed",
    "status_as_of": date(2026, 6, 8),
    "recurrence": "annual",
    "amount": Decimal("6000000"),
    "amount_currency": "CLP",
    "amount_note": None,
    "climate_relevance": "explicit",
    "specificity": "sector-specific",
    "source_url": "https://fondos.mma.gob.cl/fpa-2026/",
    "legal_basis_url": None,
    "notes": None,
    "country_code": "CL",
    "source_dataset": "cl-mma/cl-mma-fondos",
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


class _DummySession:
    """Returns the opp row for the fact query, the provenance row otherwise."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, query, params):
        sql = str(query)
        if "finance_opportunity" in sql:
            return _Result([_OPP_ROW])
        return _Result([_PROVENANCE_ROW])


def test_get_finance_opportunities_success(monkeypatch):
    monkeypatch.setattr(
        "routes.finance_opportunities.SessionLocal", lambda: _DummySession()
    )
    resp = client.get("/api/v1/climate-finance/opportunities", params={"country_code": "CL"})
    assert resp.status_code == 200
    body = resp.json()

    # meta.datasources carries the flat provenance block
    assert body["meta"]["count"] == 1
    ds = body["meta"]["datasources"][0]
    assert ds["release_id"] == str(RELEASE_ID)
    assert ds["datasource_name"] == "cl-mma-fondos"
    assert ds["version_label"] == "v1"
    assert ds["is_latest"] is True

    # one opportunity, normalized, tagged with its datasource_name
    opp = body["data"][0]
    assert opp["opportunity_name"] == "FPA 2026 - Proyectos Sustentables Ciudadanos"
    assert opp["gpc_sectors"] == ["waste", "stationary_energy", "afolu"]
    assert opp["close_date"] == "2025-10-07"   # date -> isoformat
    assert opp["amount"] == 6000000            # Decimal -> int
    assert opp["access_tier"] == "competitive"
    assert opp["datasource_name"] == "cl-mma-fondos"
    assert "release_id" not in opp             # provenance lives in meta.datasources


def test_get_finance_opportunities_no_release(monkeypatch):
    class _EmptySession(_DummySession):
        def execute(self, query, params):
            return _Result([])

    monkeypatch.setattr(
        "routes.finance_opportunities.SessionLocal", lambda: _EmptySession()
    )
    resp = client.get("/api/v1/climate-finance/opportunities")
    assert resp.status_code == 404
