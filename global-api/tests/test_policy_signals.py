from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_city_policy_signals_success(monkeypatch):
    policy_signal_id = uuid4()
    release_id = uuid4()

    class DummySession:
        def __init__(self):
            self._execute_calls = 0

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            self._execute_calls += 1

            if self._execute_calls == 1:
                class DummyScopeResult:
                    def mappings(self):
                        return self

                    def first(self):
                        return {
                            "locode": "CL SCL",
                            "region_code": "CL-RM",
                            "country_code": "CL",
                        }

                return DummyScopeResult()

            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return [
                        {
                            "policy_signal_id": policy_signal_id,
                            "location_code": "CL-RM",
                            "location_name": "Santiago",
                            "location_scope": "city",
                            "signal_type": "mandate",
                            "signal_relation": "enables",
                            "signal_strength": "high",
                            "signal_subject": "Electromobility procurement",
                            "gpc_sector": "I.4",
                            "signal_summary": "City buses must transition to cleaner fleets.",
                            "key_numeric": {"target_year": 2035},
                            "evidence_anchors": [{"source": "policy_doc"}],
                            "release_id": release_id,
                            "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
                            "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
                        }
                    ]

            return DummyResult()

    monkeypatch.setattr("routes.policy_signals.SessionLocal", lambda: DummySession())

    response = client.get(
        "/api/v1/cities/CL%20SCL/policy-signals?signal_type=mandate&gpc_sector=I.4&limit=10&offset=0"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters"]["locode"] == "CL SCL"
    assert payload["filters"]["signal_type"] == "mandate"
    assert payload["filters"]["gpc_sector"] == "I.4"
    assert len(payload["policy_signals"]) == 1
    assert payload["policy_signals"][0]["policy_signal_id"] == str(policy_signal_id)
    assert payload["policy_signals"][0]["release_id"] == str(release_id)
    assert payload["policy_signals"][0]["key_numeric"]["target_year"] == 2035


def test_get_city_policy_signals_no_data(monkeypatch):
    class DummySession:
        def __init__(self):
            self._execute_calls = 0

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, query, params):
            self._execute_calls += 1

            if self._execute_calls == 1:
                class DummyScopeResult:
                    def mappings(self):
                        return self

                    def first(self):
                        return None

                return DummyScopeResult()

            class DummyResult:
                def mappings(self):
                    return self

                def all(self):
                    return []

            return DummyResult()

    monkeypatch.setattr("routes.policy_signals.SessionLocal", lambda: DummySession())

    response = client.get("/api/v1/cities/CL%20SCL/policy-signals")
    assert response.status_code == 404
    assert response.json() == {"detail": "No policy signals found"}
