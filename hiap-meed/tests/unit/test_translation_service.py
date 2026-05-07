"""Unit tests for canonical explanation translation helpers."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.services.translation import (
    ActionTranslationRow,
    TranslationItem,
    _rows_to_translations,
)


def test_rows_to_translations_accepts_full_action_language_coverage() -> None:
    """Translation rows should be accepted when every action has every target language."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="pt", text="Traducao um")],
            source_language_warning=False,
        ),
        ActionTranslationRow(
            action_id="A_2",
            translations=[TranslationItem(language="pt", text="Traducao dois")],
            source_language_warning=True,
        ),
    ]

    translations_by_action_id, warning_action_ids = _rows_to_translations(
        translation_rows=rows,
        expected_action_ids={"A_1", "A_2"},
        target_languages=["pt"],
    )

    assert translations_by_action_id == {
        "A_1": {"pt": "Traducao um"},
        "A_2": {"pt": "Traducao dois"},
    }
    assert warning_action_ids == ["A_2"]


def test_rows_to_translations_rejects_missing_action_rows() -> None:
    """Translation rows should fail when the LLM omits one expected action."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="pt", text="Traducao um")],
            source_language_warning=False,
        )
    ]

    with pytest.raises(ValueError, match="missing action rows"):
        _rows_to_translations(
            translation_rows=rows,
            expected_action_ids={"A_1", "A_2"},
            target_languages=["pt"],
        )


def test_rows_to_translations_rejects_missing_target_language_coverage() -> None:
    """Translation rows should fail when one requested language is missing for an action."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="pt", text="Traducao um")],
            source_language_warning=False,
        )
    ]

    with pytest.raises(ValueError, match="missing target-language coverage"):
        _rows_to_translations(
            translation_rows=rows,
            expected_action_ids={"A_1"},
            target_languages=["pt", "es"],
        )
