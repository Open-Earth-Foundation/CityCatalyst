from datetime import date
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

RELEASE_ID = uuid4()

_PROVENANCE_ROW = {
    "release_id": RELEASE_ID,
    "datasource_name": "cl-gcf-projects",
    "publisher_name": "Green Climate Fund",
    "publisher_url": "https://greenclimate.fund",
    "dataset_name": "GCF Chile projects",
    "dataset_url": "https://greenclimate.fund/projects",
    "version_label": "v1",
    "is_latest": True,
}

_PROJECT_ROW = {
    "release_id": RELEASE_ID,
    "project_name": "Programa de Resiliencia Urbana Santiago",
    "project_name_i18n": {"en": "Santiago Urban Resilience Program"},
    "sector": "transportation",
    "jurisdiction": "Región Metropolitana",
    "actor_id": "CL SCL",
    "lifecycle_stage": "implementation",
    "funding_channel": "intermediated multilateral",
    "cost_total": Decimal("1500000"),
    "amount_committed": Decimal("1000000"),
    "amount_paid": None,
    "amount_unit": "USD",
    "funding_sources": [{"name": "GCF", "share": 0.6}],
    "source_dataset": "gcf/cl-gcf-projects",
    "country_code": "CL",
    "action_matches": [{"action_id": "C40_2", "confidence": "strong"}],
}


class _Result:
    def __init__(self, rows, scalar_value=None):
        self._rows = rows
        self._scalar = scalar_value

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._scalar


class _DummySession:
    """Routes the three queries: provenance, count, and the project list."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, query, params=None):
        sql = str(query)
        if "dataset_release" in sql:
            return _Result([_PROVENANCE_ROW])
        if "count(" in sql:
            return _Result([], scalar_value=1)
        return _Result([_PROJECT_ROW])


def test_get_finance_projects_success(monkeypatch):
    monkeypatch.setattr(
        "routes.legacy.city_finance_projects.SessionLocal", lambda: _DummySession()
    )
    resp = client.get("/api/v1/climate-finance/projects", params={"country_code": "CL"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["meta"]["count"] == 1
    assert body["meta"]["total"] == 1
    ds = body["meta"]["datasources"][0]
    assert ds["release_id"] == str(RELEASE_ID)
    assert ds["datasource_name"] == "cl-gcf-projects"
    assert ds["version_label"] == "v1"

    proj = body["data"][0]
    assert proj["project_name"] == "Programa de Resiliencia Urbana Santiago"
    assert proj["sector"] == "transportation"
    assert proj["cost_total"] == 1500000              # Decimal -> int
    assert proj["action_matches"] == [{"action_id": "C40_2", "confidence": "strong"}]
    assert proj["datasource_name"] == "cl-gcf-projects"
    assert "release_id" not in proj                   # provenance lives in meta.datasources


def test_get_finance_projects_no_release(monkeypatch):
    class _EmptySession(_DummySession):
        def execute(self, query, params=None):
            return _Result([], scalar_value=0)

    monkeypatch.setattr(
        "routes.legacy.city_finance_projects.SessionLocal", lambda: _EmptySession()
    )
    resp = client.get("/api/v1/climate-finance/projects")
    assert resp.status_code == 404
