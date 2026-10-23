"""Route tests, including the mandatory scaffold flags on `/v1/prioritize`."""

import logging

import pytest
from fastapi.testclient import TestClient


def _body(modality: str = "mitigation", **overrides: str) -> dict:
    request_data = {
        "region": "BR",
        "methodology": "ccc",
        "methodologyVersion": "v1",
        "modality": modality,
    }
    request_data.update(overrides)
    return {"meta": {"requestId": "req-1"}, "requestData": request_data}


@pytest.mark.unit
def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.unit
@pytest.mark.parametrize("modality", ["mitigation", "adaptation"])
def test_prioritize_marks_response_as_scaffold_mock(
    client: TestClient, modality: str, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="app"):
        response = client.post("/v1/prioritize", json=_body(modality))

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["mock"] is True
    assert payload["meta"]["methodologyStatus"] == "scaffold"
    assert payload["meta"]["requestId"] == "req-1"
    assert payload["meta"]["totalRecords"] == len(payload["responseData"]["ranked"]) > 0
    assert any("scaffold" in record.getMessage().lower() for record in caplog.records)


@pytest.mark.unit
def test_prioritize_ranks_deterministically(client: TestClient) -> None:
    first = client.post("/v1/prioritize", json=_body()).json()["responseData"]["ranked"]
    second = client.post("/v1/prioritize", json=_body()).json()["responseData"]["ranked"]

    assert first == second
    assert [item["rank"] for item in first] == list(range(1, len(first) + 1))
    scores = [item["finalScore"] for item in first]
    assert scores == sorted(scores, reverse=True)


@pytest.mark.unit
def test_prioritize_unsupported_combination_returns_422(client: TestClient) -> None:
    response = client.post("/v1/prioritize", json=_body(region="XX"))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["requestId"] == "req-1"
    assert detail["error"]["code"] == "unsupported_combination"
    assert detail["error"]["details"]["region"] == "XX"


@pytest.mark.unit
def test_prioritize_rejects_unknown_modality(client: TestClient) -> None:
    response = client.post("/v1/prioritize", json=_body(modality="other"))

    assert response.status_code == 422
