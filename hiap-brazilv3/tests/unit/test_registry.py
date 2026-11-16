"""Unit tests for the combination registry."""

from dataclasses import replace
from pathlib import Path

import pytest

from app.api.errors import unsupported_combination_detail
from app.registry import REGISTRY, UnsupportedCombinationError, resolve


@pytest.mark.unit
@pytest.mark.parametrize("modality", ["mitigation", "adaptation"])
def test_resolve_registered_combination(modality: str) -> None:
    """A registered combination resolves for both modalities."""
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
    """An unknown region, methodology or version never lists the modality in the error."""
    with pytest.raises(UnsupportedCombinationError) as caught:
        resolve(*key, "mitigation")

    assert caught.value.modality_is_reason is False
    detail = unsupported_combination_detail(caught.value, "req-1")
    assert detail["error"]["code"] == "unsupported_combination"
    assert "modality" not in detail["error"]["details"]


@pytest.mark.unit
def test_resolve_missing_modality_reports_modality(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the combination exists but lacks the modality, the error lists the modality."""
    original = REGISTRY[("BR", "ccc", "v1")]
    mitigation_only = replace(
        original, pipelines={"mitigation": original.pipelines["mitigation"]}
    )
    monkeypatch.setitem(REGISTRY, ("BR", "ccc", "v1"), mitigation_only)

    with pytest.raises(UnsupportedCombinationError) as caught:
        resolve("BR", "ccc", "v1", "adaptation")

    assert caught.value.modality_is_reason is True
    details = unsupported_combination_detail(caught.value, "req-1")["error"]["details"]
    assert details["modality"] == "adaptation"
    assert details["supportedModalities"] == ["mitigation"]


@pytest.mark.unit
def test_regions_do_not_import_methodologies() -> None:
    """Region code must not import methodology code (layering rule; the registry joins them)."""
    regions_dir = Path(__file__).parents[2] / "app" / "regions"
    offenders = [
        str(path)
        for path in regions_dir.rglob("*.py")
        if "app.methodologies" in path.read_text(encoding="utf-8")
    ]

    assert offenders == []
