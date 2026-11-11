"""Route tests, including the mandatory scaffold flags and warnings."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _body(modality: str = "mitigation", **overrides: str) -> dict:
    """Build a valid `/v1/prioritize` request body, with optional field overrides."""
    request_data = {
        "region": "BR",
        "methodology": "ccc",
        "methodologyVersion": "v1",
        "modality": modality,
    }
    request_data.update(overrides)
    return {"meta": {"requestId": "req-1"}, "requestData": request_data}


def _scaffold_warnings(caplog: pytest.LogCaptureFixture) -> list[str]:
    """Return captured WARNING messages that mention the scaffold."""
    return [
        record.getMessage()
        for record in caplog.records
        if record.levelno == logging.WARNING and "scaffold" in record.getMessage().lower()
    ]


@pytest.mark.unit
def test_health(client: TestClient) -> None:
    """The health endpoint reports healthy."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.unit
@pytest.mark.parametrize("modality", ["mitigation", "adaptation"])
def test_prioritize_marks_response_as_scaffold_mock(
    client: TestClient, modality: str, caplog: pytest.LogCaptureFixture
) -> None:
    """Every successful ranking carries the scaffold flags and logs a scaffold warning."""
    with caplog.at_level(logging.WARNING, logger="app"):
        response = client.post("/v1/prioritize", json=_body(modality))

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["mock"] is True
    assert payload["meta"]["methodologyStatus"] == "scaffold"
    assert payload["meta"]["requestId"] == "req-1"
    assert payload["meta"]["totalRecords"] == len(payload["responseData"]["ranked"]) > 0
    assert _scaffold_warnings(caplog)


@pytest.mark.unit
def test_prioritize_ranks_deterministically(client: TestClient) -> None:
    """Repeated requests give the same ordered ranking, highest score first."""
    first = client.post("/v1/prioritize", json=_body()).json()["responseData"]["ranked"]
    second = client.post("/v1/prioritize", json=_body()).json()["responseData"]["ranked"]

    assert first == second
    assert [item["rank"] for item in first] == list(range(1, len(first) + 1))
    scores = [item["finalScore"] for item in first]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.unit
def test_prioritize_unsupported_combination_returns_422_and_warns(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """An unknown region returns 422 `unsupported_combination` and still logs the scaffold warning."""
    with caplog.at_level(logging.WARNING, logger="app"):
        response = client.post("/v1/prioritize", json=_body(region="XX"))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["requestId"] == "req-1"
    assert detail["error"]["code"] == "unsupported_combination"
    assert detail["error"]["details"]["region"] == "XX"
    assert _scaffold_warnings(caplog)


@pytest.mark.unit
def test_prioritize_rejects_unknown_modality(client: TestClient) -> None:
    """A modality outside the API vocabulary fails request validation."""
    response = client.post("/v1/prioritize", json=_body(modality="other"))

    assert response.status_code == 422


@pytest.mark.unit
def test_startup_logs_scaffold_warning(caplog: pytest.LogCaptureFixture) -> None:
    """Starting the app (lifespan) logs the scaffold warning."""
    with caplog.at_level(logging.WARNING, logger="app"):
        with TestClient(app):
            pass

    assert _scaffold_warnings(caplog)
