"""Unit tests for the combination registry."""

import pytest

from app.api.errors import unsupported_combination_detail
from app.registry import REGISTRY, RegisteredCombination, UnsupportedCombinationError, resolve


@pytest.mark.unit
@pytest.mark.parametrize("modality", ["mitigation", "adaptation"])
def test_resolve_registered_combination(modality: str) -> None:
    combination, pipeline = resolve("BR", "ccc", "v1", modality)

    assert combination is REGISTRY[("BR", "ccc", "v1")]
    assert callable(pipeline)


@pytest.mark.unit
@pytest.mark.parametrize(
    "key",
    [("XX", "ccc", "v1"), ("BR", "other", "v1"), ("BR", "ccc", "v9")],
)
def test_resolve_unknown_combination_does_not_blame_modality(
    key: tuple[str, str, str],
) -> None:
    with pytest.raises(UnsupportedCombinationError) as caught:
        resolve(*key, "mitigation")

    assert caught.value.modality_is_reason is False
    detail = unsupported_combination_detail(caught.value, "req-1")
    assert detail["error"]["code"] == "unsupported_combination"
    assert "modality" not in detail["error"]["details"]


@pytest.mark.unit
def test_resolve_missing_modality_reports_modality(monkeypatch: pytest.MonkeyPatch) -> None:
    mitigation_only = RegisteredCombination(
        pipelines={"mitigation": REGISTRY[("BR", "ccc", "v1")].pipelines["mitigation"]},
        load_items=REGISTRY[("BR", "ccc", "v1")].load_items,
        load_config=REGISTRY[("BR", "ccc", "v1")].load_config,
    )
    monkeypatch.setitem(REGISTRY, ("BR", "ccc", "v1"), mitigation_only)

    with pytest.raises(UnsupportedCombinationError) as caught:
        resolve("BR", "ccc", "v1", "adaptation")

    assert caught.value.modality_is_reason is True
    details = unsupported_combination_detail(caught.value, "req-1")["error"]["details"]
    assert details["modality"] == "adaptation"
    assert details["supportedModalities"] == ["mitigation"]
