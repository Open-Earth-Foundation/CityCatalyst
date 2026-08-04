"""Unit tests for shared deterministic prioritizer terminology."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.localization import (
    chapter_terms,
    chapter_title,
    localized_source_value,
    supported_languages,
    terminology_for_translation,
    translate_term,
)


def test_translation_catalogue_contains_supported_languages() -> None:
    """The editable catalogue should define the shared public language set."""
    assert supported_languages() == ("en", "es")


def test_recurring_report_terminology_is_deterministic() -> None:
    """Chapter titles and recurring domain terms should not rely on the LLM."""
    assert chapter_title("city_fit", "es") == "Adecuación a la ciudad"
    assert chapter_terms("snapshot", "es")["what_we_checked"] == "Qué se evaluó"
    assert translate_term("co_benefits", "air_quality", "es") == "Calidad del aire"
    assert (
        translate_term("gpc_sectors", "stationary_energy", "es")
        == "Energía estacionaria"
    )
    assert translate_term("gpc_sectors", "afolu", "en") == (
        "Agriculture, forestry and other land use"
    )


def test_official_source_names_are_not_translated() -> None:
    """Source values without an i18n variant should remain in their official form."""
    assert (
        localized_source_value(
            language="en",
            localized={},
            fallback="Plan de Mitigación Sector Energía",
        )
        == "Plan de Mitigación Sector Energía"
    )


def test_translation_terminology_contains_source_and_exact_target() -> None:
    """Translation prompts should receive shared English-to-target term pairs."""
    terminology = terminology_for_translation(["es"])

    assert terminology["es"]["co_benefits"]["air_quality"] == {
        "source": "Air quality",
        "target": "Calidad del aire",
    }


def test_translation_terminology_rejects_unsupported_languages() -> None:
    """A language cannot be translated before its shared catalogue is complete."""
    with pytest.raises(ValueError, match="Unsupported translation languages"):
        terminology_for_translation(["de"])


def test_missing_required_translation_fails_closed() -> None:
    """Missing configured chapter terminology must not silently cross-fallback."""
    with pytest.raises(ValueError, match="Missing `pt` translation"):
        chapter_title("snapshot", "pt")
