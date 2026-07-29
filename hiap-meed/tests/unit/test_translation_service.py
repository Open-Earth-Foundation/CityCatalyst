"""Unit tests for canonical explanation translation helpers."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.modules.prioritizer.services import translation as translation_service
from app.modules.prioritizer.services.translation import (
    ActionTranslationRow,
    TranslationItem,
    _build_prompt,
    _rows_to_translations,
    _validate_translation_languages,
    translate_explanations,
)


def test_rows_to_translations_accepts_full_action_language_coverage() -> None:
    """Translation rows should be accepted when every action has every target language."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="es", text="Traducción uno")],
            source_language_warning=False,
        ),
        ActionTranslationRow(
            action_id="A_2",
            translations=[TranslationItem(language="es", text="Traducción dos")],
            source_language_warning=True,
        ),
    ]

    translations_by_action_id, warning_action_ids = _rows_to_translations(
        translation_rows=rows,
        expected_action_ids={"A_1", "A_2"},
        target_languages=["es"],
    )

    assert translations_by_action_id == {
        "A_1": {"es": "Traducción uno"},
        "A_2": {"es": "Traducción dos"},
    }
    assert warning_action_ids == ["A_2"]


def test_rows_to_translations_rejects_missing_action_rows() -> None:
    """Translation rows should fail when the LLM omits one expected action."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="es", text="Traducción uno")],
            source_language_warning=False,
        )
    ]

    with pytest.raises(ValueError, match="missing action rows"):
        _rows_to_translations(
            translation_rows=rows,
            expected_action_ids={"A_1", "A_2"},
            target_languages=["es"],
        )


def test_rows_to_translations_rejects_missing_target_language_coverage() -> None:
    """Translation rows should fail when one requested language is missing for an action."""
    rows = [
        ActionTranslationRow(
            action_id="A_1",
            translations=[TranslationItem(language="es", text="Traducción uno")],
            source_language_warning=False,
        )
    ]

    with pytest.raises(ValueError, match="missing target-language coverage"):
        _rows_to_translations(
            translation_rows=rows,
            expected_action_ids={"A_1"},
            target_languages=["es", "de"],
        )


def test_translation_prompt_contains_shared_terminology() -> None:
    """The endpoint prompt should carry exact source/target terminology pairs."""
    prompt = _build_prompt(
        source_language="en",
        target_languages=["es"],
        actions_payload=[
            {"action_id": "A_1", "canonical_explanation": "Air quality improves."}
        ],
        terminology={
            "es": {
                "co_benefits": {
                    "air_quality": {
                        "source": "Air quality",
                        "target": "Calidad del aire",
                    }
                }
            }
        },
    )

    assert '"source": "Air quality"' in prompt
    assert '"target": "Calidad del aire"' in prompt
    assert "use its exact `target` value" in prompt


def test_translation_language_validation_rejects_wrong_language() -> None:
    """A clearly wrong target language should be rejected before returning it."""
    with pytest.raises(ValueError, match="instead of `es`"):
        _validate_translation_languages(
            {
                "A_1": {
                    "es": (
                        "This action improves air quality and public transport, but "
                        "financial feasibility remains a material constraint."
                    )
                }
            }
        )


def test_translate_explanations_retries_invalid_output_with_strict_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Canonical translations should retry without parsed SDK completion objects."""
    captured: dict[str, object] = {}

    class FakeCompletions:
        """Return one invalid batch before a complete Spanish translation."""

        calls = 0

        def create(self, **kwargs: object) -> SimpleNamespace:
            """Capture the request and return invalid output once before success."""
            self.calls += 1
            captured.update(kwargs)
            if self.calls == 1:
                content = json.dumps({"translations": []})
            else:
                content = json.dumps(
                    {
                        "translations": [
                            {
                                "action_id": "A_1",
                                "translations": [
                                    {
                                        "language": "es",
                                        "text": (
                                            "Esta acción mejora la calidad del aire "
                                            "y mantiene una viabilidad clara."
                                        ),
                                    }
                                ],
                                "source_language_warning": False,
                            }
                        ]
                    }
                )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
            )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )
    monkeypatch.setattr(translation_service, "create_openai_client", lambda: fake_client)
    monkeypatch.setattr(
        translation_service,
        "get_explanation_translations_model",
        lambda: "test-model",
    )
    monkeypatch.setattr(
        translation_service,
        "get_explanation_translations_temperature",
        lambda: 0.0,
    )

    translations, warnings, llm_io = translate_explanations(
        canonical_explanations_by_action_id={
            "A_1": "This action improves air quality and remains feasible."
        },
        target_languages=["es"],
    )

    assert translations == {
        "A_1": {"es": "Esta acción mejora la calidad del aire y mantiene una viabilidad clara."}
    }
    assert warnings == []
    assert fake_client.chat.completions.calls == 2
    attempts = llm_io["llm_output"]["attempts"]  # type: ignore[index]
    assert len(attempts) == 2
    assert "validation_error" in attempts[0]
    schema = captured["response_format"]["json_schema"]["schema"]  # type: ignore[index]
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["TranslationItem"]["additionalProperties"] is False
