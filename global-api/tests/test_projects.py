from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_projects_success(monkeypatch):
    project_id = uuid4()
    summary_id = uuid4()

    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return [
                        {
                            "project_id": project_id,
                            "source_name": "world_bank",
                            "source_project_id": "P123",
                            "project_status": "active",
                            "project_type": "investment",
                            "country_code": "CL",
                            "country_name": "Chile",
                            "approval_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
                            "closing_at": None,
                            "sector_name": "Transport",
                            "project_summary_id": summary_id,
                            "project_title": "Urban Resilience Program",
                            "funder_id": "WB",
                            "funder_name": "World Bank",
                            "region_name": "Metropolitana",
                            "city_name": "Santiago",
                            "subsector_name": "Mobility",
                            "total_budget_amount_usd": Decimal("1500000"),
                            "primary_funder_amount_usd": Decimal("1000000"),
                            "financing_instrument": "Sovereign loan",
                            "project_summary_text": "Summary",
                            "lessons_learned": "Lessons",
                            "synthesis_notes": "Notes",
                            "site_context": {"urban_density": "high"},
                            "financing_structure": {"debt_share": 0.8},
                            "data_completeness": {"score": 0.9},
                            "actions_implemented": ["bus lanes"],
                            "key_risks": ["procurement"],
                            "evidence_anchors": [{"type": "pad"}],
                            "secondary_project_types": ["policy"],
                            "co_financiers": ["IDB"],
                            "co_benefits": ["air quality"],
                            "key_interventions": ["fleet electrification"],
                            "replicability_conditions": {"governance": "strong"},
                            "model_metadata": {"model_version": "v1"},
                        }
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.projects.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/projects?country_code=CL&limit=10&offset=0")
    assert response.status_code == 200

    payload = response.json()
    assert payload["filters"]["country_code"] == "CL"
    assert len(payload["project_summaries"]) == 1

    summary = payload["project_summaries"][0]
    assert summary["project_id"] == str(project_id)
    assert summary["project_summary_id"] == str(summary_id)
    assert summary["total_budget_amount_usd"] == 1500000
    assert summary["primary_funder_amount_usd"] == 1000000


def test_get_projects_no_data(monkeypatch):
    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return []

            return DummyResult()

    monkeypatch.setattr("routes.projects.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/projects")
    assert response.status_code == 404
    assert response.json() == {"detail": "No project summaries found"}


def test_get_project_by_id_success(monkeypatch):
    project_id = uuid4()

    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return {
                        "project_id": project_id,
                        "source_name": "world_bank",
                        "source_project_id": "P123",
                        "project_status": "active",
                        "project_type": "investment",
                        "country_code": "CL",
                        "country_name": "Chile",
                        "approval_at": None,
                        "closing_at": None,
                        "sector_name": "Transport",
                        "project_summary_id": uuid4(),
                        "project_title": "Urban Resilience Program",
                        "funder_id": "WB",
                        "funder_name": "World Bank",
                        "region_name": None,
                        "city_name": None,
                        "subsector_name": None,
                        "total_budget_amount_usd": None,
                        "primary_funder_amount_usd": None,
                        "financing_instrument": None,
                        "project_summary_text": None,
                        "lessons_learned": None,
                        "synthesis_notes": None,
                        "site_context": None,
                        "financing_structure": None,
                        "data_completeness": None,
                        "actions_implemented": None,
                        "key_risks": None,
                        "evidence_anchors": None,
                        "secondary_project_types": None,
                        "co_financiers": None,
                        "co_benefits": None,
                        "key_interventions": None,
                        "replicability_conditions": None,
                        "model_metadata": None,
                    }

            return DummyResult()

    monkeypatch.setattr("routes.projects.SessionLocal", lambda: DummySession())

    response = client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["project_id"] == str(project_id)
    assert payload["funder_name"] == "World Bank"


def test_get_project_by_id_not_found(monkeypatch):
    project_id = uuid4()

    class DummySession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            class DummyResult:
                def mappings(self):
                    return self

                def first(self):
                    return None

            return DummyResult()

    monkeypatch.setattr("routes.projects.SessionLocal", lambda: DummySession())

    response = client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Project summary not found"}
