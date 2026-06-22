from datetime import date
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

RELEASE_ID = uuid4()
OPP_ID = uuid4()

_RELEASE_ROW = {
    "release_id": RELEASE_ID,
    "version_label": "v1",
    "released_at": date(2026, 6, 19),
    "source_url": "https://example.org/release",
}

_OPP_ROW = {
    "opportunity_id": OPP_ID,
    "source_opportunity_id": "cl-mma-fpa-2026-proyectos-sustentables-ciudadanos",
    "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos",
    "program_family": "Fondo de Protección Ambiental",
    "funder_name": "Ministerio del Medio Ambiente (MMA)",
    "funder_level": None,
    "funder_channel": "competitive fund",
    "provider": None,
    "instrument": "grant",
    "gpc_sectors": ["waste", "stationary_energy", "afolu"],
    "thematic_lines": ["Economía Circular y Gestión de Residuos"],
    "eligible_actor": "community/citizen org",
    "eligible_actor_detail": "non-profit private legal persons; NOT municipalities",
    "city_application": "direct",
    "funding_channel": "competitive fund",
    "access_tier": "competitive",
    "access_pathway": "direct application (via fondos.gob.cl)",
    "open_date": date(2025, 8, 26),
    "close_date": date(2025, 10, 7),
    "status": "closed",
    "lifecycle": "post-award",
    "status_as_of": date(2026, 6, 8),
    "recurrence": "annual",
    "next_call_estimate": "~Aug-Oct 2026",
    "amount_clp": Decimal("6000000"),
    "amount_note": None,
    "climate_relevance": "explicit",
    "specificity": "sector-specific",
    "source_url": "https://fondos.mma.gob.cl/fpa-2026/",
    "resolucion_url": None,
    "detail_level": "detailed",
    "data_quality_flags": None,
    "source_extras": None,
    "notes": None,
    "country_code": "CL",
    "source_dataset": "cl-mma/cl-mma-fondos",
}


class _DummySession:
    """Returns the release row for the resolve query, the opp row for the list query."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, query, params):
        sql = str(query)

        class _Result:
            def __init__(self, rows):
                self._rows = rows

            def mappings(self):
                return self

            def all(self):
                return self._rows

            def first(self):
                return self._rows[0] if self._rows else None

        if "dataset_release" in sql:
            return _Result([_RELEASE_ROW])
        return _Result([_OPP_ROW])


def test_get_finance_opportunities_success(monkeypatch):
    monkeypatch.setattr(
        "routes.finance_opportunities.SessionLocal", lambda: _DummySession()
    )
    resp = client.get("/api/v1/finance/opportunities", params={"country_code": "CL"})
    assert resp.status_code == 200
    body = resp.json()

    # meta carries release provenance
    assert body["meta"]["release"]["version_label"] == "v1"
    assert body["meta"]["release"]["release_id"] == str(RELEASE_ID)
    assert body["meta"]["count"] == 1

    # one opportunity, with the rich audited fields preserved + normalized
    opp = body["data"][0]
    assert opp["opportunity_id"] == str(OPP_ID)
    assert opp["gpc_sectors"] == ["waste", "stationary_energy", "afolu"]
    assert opp["close_date"] == "2025-10-07"            # date -> isoformat
    assert opp["amount_clp"] == 6000000                  # Decimal -> int
    assert opp["next_call_estimate"] == "~Aug-Oct 2026"  # rich field retained
    assert opp["eligible_actor_detail"].startswith("non-profit")
    assert opp["access_tier"] == "competitive"


def test_get_finance_opportunities_no_release(monkeypatch):
    class _EmptySession(_DummySession):
        def execute(self, query, params):
            class _Empty:
                def mappings(self):
                    return self

                def all(self):
                    return []

                def first(self):
                    return None

            return _Empty()

    monkeypatch.setattr(
        "routes.finance_opportunities.SessionLocal", lambda: _EmptySession()
    )
    resp = client.get("/api/v1/finance/opportunities")
    assert resp.status_code == 404
