"""Tests for the adapter boundary: caller `inputs` and backend config per registration.

Two small test adapters with different input shapes and different config
schemas prove that each registration validates its own models. They are
registered only inside these tests and are not real methodologies.
"""

from dataclasses import dataclass, field
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, ValidationError

from app.methodologies.ccc.v1.config_schema import MethodologyConfig
from app.registry import REGISTRY, RegisteredCombination, validate_config
from app.shared.contracts import RankableItem, RankedItem, RankingResult, ScoreVector


class LocodeInputs(BaseModel):
    """Adapter A inputs: a single city code."""

    model_config = ConfigDict(extra="forbid")

    locode: str


class CityRow(BaseModel):
    """One city row of adapter B."""

    model_config = ConfigDict(extra="forbid")

    name: str
    population: int


class CityDataInputs(BaseModel):
    """Adapter B inputs: a list of city rows."""

    model_config = ConfigDict(extra="forbid")

    cityDataList: list[CityRow]


class AdapterAConfig(BaseModel):
    """Backend config of adapter A: its own pillars plus a dataset version."""

    model_config = ConfigDict(extra="forbid")

    weights: dict[str, float]
    risk_dataset_version: str


class AdapterBConfig(BaseModel):
    """Backend config of adapter B: unrelated to adapter A."""

    model_config = ConfigDict(extra="forbid")

    top_n: int


@dataclass
class Calls:
    """What a test adapter's pipeline received."""

    received: list[tuple[BaseModel, BaseModel]] = field(default_factory=list)


def _registration(
    inputs_model: type[BaseModel], config_model: type[BaseModel], raw_config: dict[str, Any], calls: Calls
) -> RegisteredCombination:
    """Build a test registration whose pipeline records its validated config and inputs."""

    def pipeline(items: list[RankableItem], config: BaseModel, inputs: BaseModel) -> RankingResult:
        """Record the models received and rank the single item."""
        calls.received.append((config, inputs))
        return RankingResult(
            ranked=[
                RankedItem(
                    item_id=items[0].id,
                    rank=1,
                    final_score=1.0,
                    score_vector=ScoreVector(scores={}),
                )
            ]
        )

    def load_items(modality: str, inputs: BaseModel) -> list[RankableItem]:
        """Return one fixed item."""
        return [RankableItem(id="test-item", name="Test item")]

    return RegisteredCombination(
        pipelines={"mitigation": pipeline},
        inputs_model=inputs_model,
        load_items=load_items,
        load_config=lambda: validate_config(config_model, lambda: raw_config),
    )


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> dict[str, Calls]:
    """Register test adapters T1 (locode) and T2 (cityDataList); return their call records."""
    records = {"T1": Calls(), "T2": Calls()}
    monkeypatch.setitem(
        REGISTRY,
        ("T1", "test", "v1"),
        _registration(
            LocodeInputs,
            AdapterAConfig,
            {"weights": {"risk": 0.6, "readiness": 0.4}, "risk_dataset_version": "2026"},
            records["T1"],
        ),
    )
    monkeypatch.setitem(
        REGISTRY,
        ("T2", "test", "v1"),
        _registration(CityDataInputs, AdapterBConfig, {"top_n": 3}, records["T2"]),
    )
    return records


def _post(client: TestClient, region: str, inputs: dict[str, Any] | None = None) -> Any:
    """Post a mitigation request for `region`, optionally with an `inputs` object."""
    request_data: dict[str, Any] = {
        "region": region,
        "methodology": "test" if region != "BR" else "ccc",
        "methodologyVersion": "v1",
        "modality": "mitigation",
    }
    if inputs is not None:
        request_data["inputs"] = inputs
    return client.post(
        "/v1/prioritize", json={"meta": {"requestId": "req-1"}, "requestData": request_data}
    )


def _error_locations(response: Any) -> list[tuple]:
    """Return (location, type) pairs from an `invalid_inputs` response."""
    errors = response.json()["detail"]["error"]["details"]["errors"]
    return [(tuple(error["loc"]), error["type"]) for error in errors]


@pytest.mark.unit
def test_valid_inputs_reach_the_adapter_pipeline(
    client: TestClient, calls: dict[str, Calls]
) -> None:
    """Validated inputs and the registration's own config are passed to its pipeline."""
    response = _post(client, "T1", {"locode": "BR SAO"})

    assert response.status_code == 200
    config, inputs = calls["T1"].received[0]
    assert inputs == LocodeInputs(locode="BR SAO")
    assert isinstance(config, AdapterAConfig)
    assert config.weights == {"risk": 0.6, "readiness": 0.4}


@pytest.mark.unit
def test_adapter_rejects_missing_field(client: TestClient, calls: dict[str, Calls]) -> None:
    """A missing required field returns 422 `invalid_inputs`."""
    response = _post(client, "T1", {})

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "invalid_inputs"
    assert _error_locations(response) == [(("locode",), "missing")]
    assert calls["T1"].received == []


@pytest.mark.unit
def test_adapter_rejects_wrong_type(client: TestClient, calls: dict[str, Calls]) -> None:
    """A mistyped field returns 422 `invalid_inputs`."""
    response = _post(client, "T1", {"locode": 5})

    assert response.status_code == 422
    assert _error_locations(response) == [(("locode",), "string_type")]


@pytest.mark.unit
def test_adapter_rejects_unexpected_field(client: TestClient, calls: dict[str, Calls]) -> None:
    """An extra field returns 422 `invalid_inputs`."""
    response = _post(client, "T1", {"locode": "BR SAO", "extra": 1})

    assert response.status_code == 422
    assert _error_locations(response) == [(("extra",), "extra_forbidden")]


@pytest.mark.unit
def test_adapters_accept_different_input_shapes(
    client: TestClient, calls: dict[str, Calls]
) -> None:
    """Each adapter accepts only its own shape; the other adapter's shape is rejected."""
    city_data = {"cityDataList": [{"name": "Sao Paulo", "population": 12}]}

    assert _post(client, "T2", city_data).status_code == 200
    assert _post(client, "T2", {"locode": "BR SAO"}).status_code == 422
    assert _post(client, "T1", city_data).status_code == 422
    assert calls["T2"].received[0][1] == CityDataInputs(
        cityDataList=[CityRow(name="Sao Paulo", population=12)]
    )


@pytest.mark.unit
def test_adapter_reports_nested_error_location(
    client: TestClient, calls: dict[str, Calls]
) -> None:
    """Errors inside nested inputs point at the exact path."""
    response = _post(client, "T2", {"cityDataList": [{"name": "Sao Paulo", "population": "x"}]})

    assert response.status_code == 422
    assert _error_locations(response) == [(("cityDataList", 0, "population"), "int_parsing")]


@pytest.mark.unit
def test_brazil_scaffold_accepts_no_inputs(client: TestClient) -> None:
    """The BR scaffold needs no inputs: omitted or empty is fine, any field is rejected."""
    assert _post(client, "BR").status_code == 200
    assert _post(client, "BR", {}).status_code == 200

    response = _post(client, "BR", {"locode": "BR SAO"})
    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "invalid_inputs"


@pytest.mark.unit
def test_unsupported_combination_is_reported_before_inputs(client: TestClient) -> None:
    """An unknown combination is rejected as such even when `inputs` would also be invalid."""
    response = _post(client, "XX", {"anything": 1})

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "unsupported_combination"


@pytest.mark.unit
def test_outer_request_rejects_unknown_top_level_field(client: TestClient) -> None:
    """Unknown fields next to `inputs` still fail the common request validation."""
    response = client.post(
        "/v1/prioritize",
        json={
            "meta": {"requestId": "req-1"},
            "requestData": {
                "region": "BR",
                "methodology": "ccc",
                "methodologyVersion": "v1",
                "modality": "mitigation",
                "locode": "BR SAO",
            },
        },
    )

    assert response.status_code == 422


@pytest.mark.unit
def test_each_registration_validates_its_own_config(calls: dict[str, Calls]) -> None:
    """Registrations with different config schemas each load their own settings."""
    config_a = REGISTRY[("T1", "test", "v1")].load_config()
    config_b = REGISTRY[("T2", "test", "v1")].load_config()
    config_br = REGISTRY[("BR", "ccc", "v1")].load_config()

    assert isinstance(config_a, AdapterAConfig)
    assert isinstance(config_b, AdapterBConfig)
    assert isinstance(config_br, MethodologyConfig)


@pytest.mark.unit
def test_config_models_reject_unknown_settings() -> None:
    """A typo or foreign setting fails visibly instead of being dropped."""
    with pytest.raises(ValidationError):
        validate_config(
            AdapterAConfig,
            lambda: {
                "weights": {"risk": 0.6, "readiness": 0.4},
                "risk_dataset_version": "2026",
                "risk_dataset_verson": "typo",
            },
        )
    with pytest.raises(ValidationError):
        validate_config(
            MethodologyConfig,
            lambda: {
                "weights": {"impact": 0.4, "alignment": 0.3, "feasibility": 0.3},
                "risk_dataset_version": "2026",
            },
        )


@pytest.mark.unit
def test_scaffold_config_schema_does_not_apply_to_other_registrations() -> None:
    """Weights valid for another registration are rejected only by the scaffold's own model."""
    other_weights = {"weights": {"risk": 0.6, "readiness": 0.4}, "risk_dataset_version": "2026"}

    assert validate_config(AdapterAConfig, lambda: other_weights).weights == other_weights["weights"]
    with pytest.raises(ValidationError):
        validate_config(MethodologyConfig, lambda: other_weights)
