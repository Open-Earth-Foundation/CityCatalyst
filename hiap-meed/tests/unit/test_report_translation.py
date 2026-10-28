"""Unit tests for canonical English report translation."""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, RateLimitError

from app.modules.prioritizer.report_models import ReportChapterDraft, ReportChapterInput
from app.modules.prioritizer.services import report_translation
from app.modules.prioritizer.services.report_translation import (
    ReportTranslationProviderError,
    translate_output_plan,
)


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
                                        "seleccionada. Consulte la [fuente]([[URL_SNAPSHOT_1]]) "
                                        "para conocer los resultados."
                                    ),
                                    "limitations": [
                                        "No se dispone de una estimación municipal. "
                                        "Consulte la [fuente]([[URL_SNAPSHOT_2]])."
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
            markdown=(
                "This chapter summarizes the selected municipal action. See "
                "[source](https://correct.example) for details."
            ),
            source_refs=["city"],
            limitations=[
                "A municipal estimate is unavailable. See "
                "[source](https://limitation.example)."
            ],
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
    assert report_translation.URL_PATTERN.findall(translated["es"][0].markdown) == [
        "https://correct.example"
    ]
    assert report_translation.URL_PATTERN.findall(
        translated["es"][0].limitations[0]
    ) == ["https://limitation.example"]
    assert llm_io["target_languages"] == ["es"]
    assert captured["response_format"] == report_translation._translation_response_format()
    schema = captured["response_format"]["json_schema"]["schema"]  # type: ignore[index]
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["ReportLanguageTranslation"]["additionalProperties"] is False
    assert schema["$defs"]["ReportTranslatedChapter"]["additionalProperties"] is False
    prompt = captured["messages"][1]["content"]  # type: ignore[index]
    assert "[[URL_SNAPSHOT_1]]" in prompt
    assert "[[URL_SNAPSHOT_2]]" in prompt
    assert "https://correct.example" not in prompt
    assert "https://limitation.example" not in prompt


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

    with pytest.raises(ValueError, match="did not preserve URL placeholders"):
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


def test_translated_limitations_reject_model_generated_urls() -> None:
    """A translated limitation must not introduce a non-canonical URL."""
    canonical = ReportChapterDraft(
        key="snapshot",
        title="Snapshot",
        markdown="This chapter summarizes the selected municipal action.",
        limitations=["A municipal estimate is unavailable."],
    )

    with pytest.raises(ValueError, match="unexpected URLs.*invented.example"):
        report_translation._validate_translated_content(
            canonical=canonical,
            translated_markdown=(
                "Este capítulo resume la acción municipal seleccionada para la ciudad."
            ),
            translated_limitations=[
                "No se dispone de una estimación municipal. "
                "Consulte https://invented.example."
            ],
            language="es",
        )


@pytest.mark.parametrize(
    "provider_error",
    [
        APIConnectionError(request=httpx.Request("POST", "https://api.openai.com")),
        RateLimitError(
            "rate limited",
            response=httpx.Response(
                429,
                request=httpx.Request("POST", "https://api.openai.com"),
            ),
            body=None,
        ),
    ],
)
def test_translate_output_plan_maps_transient_provider_failures(
    monkeypatch: pytest.MonkeyPatch,
    provider_error: Exception,
) -> None:
    """Transient provider failures should use the retryable service error."""

    class FakeCompletions:
        """Raise one configured transient OpenAI provider failure."""

        def create(self, **kwargs: object) -> SimpleNamespace:
            """Raise before any translation output is available."""
            del kwargs
            raise provider_error

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )
    monkeypatch.setattr(report_translation, "create_openai_client", lambda: fake_client)
    monkeypatch.setattr(report_translation, "get_output_plan_model", lambda: "test-model")

    with pytest.raises(ReportTranslationProviderError, match="temporarily unavailable"):
        translate_output_plan(
            canonical_chapters=[
                ReportChapterDraft(
                    key="snapshot",
                    title="Snapshot",
                    markdown="This chapter summarizes the municipal action.",
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
