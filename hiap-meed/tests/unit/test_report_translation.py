"""Unit tests for canonical English report translation."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.modules.prioritizer.report_models import ReportChapterDraft, ReportChapterInput
from app.modules.prioritizer.services import report_translation
from app.modules.prioritizer.services.report_translation import translate_output_plan


def test_translate_output_plan_uses_one_call_for_all_chapters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One structured call should translate the complete canonical report."""
    captured: dict[str, object] = {}

    class FakeCompletions:
        """Return one complete Spanish report translation."""

        def create(self, **kwargs: object) -> SimpleNamespace:
            """Capture the batched request and return translated chapters."""
            captured.update(kwargs)
            content = json.dumps(
                {
                    "translations": [
                        {
                            "language": "es",
                            "chapters": [
                                {
                                    "key": "snapshot",
                                    "markdown": (
                                        "Este capítulo presenta la acción municipal "
                                        "seleccionada y resume claramente sus resultados."
                                    ),
                                    "limitations": [
                                        "No se dispone de una estimación municipal."
                                    ],
                                },
                                {
                                    "key": "the_action",
                                    "markdown": (
                                        "La ciudad implementará esta acción mediante "
                                        "un programa local claramente definido."
                                    ),
                                    "limitations": [],
                                },
                            ],
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
    monkeypatch.setattr(report_translation, "create_openai_client", lambda: fake_client)
    monkeypatch.setattr(report_translation, "get_output_plan_model", lambda: "test-model")
    monkeypatch.setattr(
        report_translation, "get_output_plan_temperature", lambda: 0.0
    )
    canonical = [
        ReportChapterDraft(
            key="snapshot",
            title="Snapshot",
            markdown="This chapter summarizes the selected municipal action.",
            source_refs=["city"],
            limitations=["A municipal estimate is unavailable."],
        ),
        ReportChapterDraft(
            key="the_action",
            title="The Action",
            markdown="The city will implement the action through a local programme.",
            source_refs=["action_pathways"],
        ),
    ]
    target_inputs = {
        "es": [
            ReportChapterInput(
                key="snapshot",
                title="Resumen",
                language="es",
                terminology={"ask_label": "La solicitud"},
            ),
            ReportChapterInput(
                key="the_action",
                title="La acción",
                language="es",
            ),
        ]
    }

    translated, llm_io = translate_output_plan(
        canonical_chapters=canonical,
        target_chapter_inputs=target_inputs,
    )

    assert list(translated) == ["es"]
    assert [chapter.title for chapter in translated["es"]] == [
        "Resumen",
        "La acción",
    ]
    assert translated["es"][0].source_refs == ["city"]
    assert llm_io["target_languages"] == ["es"]
    assert captured["response_format"] == report_translation._translation_response_format()
    schema = captured["response_format"]["json_schema"]["schema"]  # type: ignore[index]
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["ReportLanguageTranslation"]["additionalProperties"] is False
    assert schema["$defs"]["ReportTranslatedChapter"]["additionalProperties"] is False


def test_translate_output_plan_rejects_changed_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Translations must preserve canonical Markdown link destinations."""

    class FakeCompletions:
        """Return a translation with a changed URL."""

        def create(self, **kwargs: object) -> SimpleNamespace:
            """Return one structurally valid but provenance-breaking translation."""
            del kwargs
            content = json.dumps(
                {
                    "translations": [
                        {
                            "language": "es",
                            "chapters": [
                                {
                                    "key": "snapshot",
                                    "markdown": (
                                        "Consulte la [fuente](https://wrong.example) "
                                        "para conocer los detalles de esta acción."
                                    ),
                                    "limitations": [],
                                }
                            ],
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
    monkeypatch.setattr(report_translation, "create_openai_client", lambda: fake_client)
    monkeypatch.setattr(report_translation, "get_output_plan_model", lambda: "test-model")

    with pytest.raises(ValueError, match="changed canonical URLs"):
        translate_output_plan(
            canonical_chapters=[
                ReportChapterDraft(
                    key="snapshot",
                    title="Snapshot",
                    markdown="See [source](https://correct.example) for details.",
                )
            ],
            target_chapter_inputs={
                "es": [
                    ReportChapterInput(
                        key="snapshot",
                        title="Resumen",
                        language="es",
                    )
                ]
            },
        )
