"""Unit tests for output-plan report generation helpers."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.modules.prioritizer.report_models import ReportChapterDraft, ReportChapterInput
from app.modules.prioritizer.services import report_generation
from app.modules.prioritizer.services.report_generation import (
    _build_chapter_prompt,
    _output_plan_response_format,
    _read_system_prompt,
    _validate_chapter_output,
    aggregate_localized_chapters,
    generate_output_plan_chapters,
)


def test_generate_output_plan_chapters_debug_mode_skips_llm() -> None:
    """Debug mode should return deterministic chapters without provider calls."""
    result = generate_output_plan_chapters(
        chapter_inputs=[
            ReportChapterInput(
                key="snapshot",
                title="Snapshot",
                language="en",
                facts={"rank": 1},
                source_refs=["city"],
                limitations=["Staleness checks deferred."],
                notion_deferred=["Track record deferred."],
            )
        ],
        use_llm=False,
    )

    assert result.llm_io == {"status": "skipped", "reason": "debug_context_only"}
    assert result.chapters[0].key == "snapshot"
    assert "rank" in result.chapters[0].markdown
    assert result.chapters[0].source_refs == ["city"]


def test_generate_output_plan_chapters_uses_schema_and_validates_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Report generation should avoid ParsedChatCompletion serialization warnings."""
    captured: dict[str, object] = {}

    class FakeCompletions:
        """Capture one ordinary chat-completion request."""

        def create(self, **kwargs: object) -> SimpleNamespace:
            """Return strict JSON content shaped like an OpenAI completion."""
            captured.update(kwargs)
            content = json.dumps(
                {
                    "markdown": "Reader-facing chapter.",
                    "source_refs": ["city"],
                    "limitations": [],
                }
            )
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
            )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )
    monkeypatch.setattr(report_generation, "create_openai_client", lambda: fake_client)
    monkeypatch.setattr(report_generation, "get_output_plan_model", lambda: "test-model")
    monkeypatch.setattr(
        report_generation, "get_output_plan_temperature", lambda: 0.0
    )

    result = generate_output_plan_chapters(
        chapter_inputs=[
            ReportChapterInput(
                key="snapshot",
                title="Snapshot",
                language="en",
                facts={"rank": 1},
                source_refs=["city"],
            )
        ]
    )

    assert result.chapters[0].markdown == "Reader-facing chapter."
    assert captured["response_format"] == _output_plan_response_format()
    assert "create" in dir(FakeCompletions)


def test_chapter_prompt_excludes_internal_diagnostic_fields() -> None:
    """Model-visible prompts should not expose artifact or backend-planning text."""
    prompt = _build_chapter_prompt(
        ReportChapterInput(
            key="sources_assumptions",
            title="Where The Information Comes From",
            language="en",
            facts={"limitations": ["Comparable project evidence is not available."]},
            source_refs=["ranking_snapshot"],
            limitations=["Snapshot-to-live source staleness was not evaluated."],
            notion_coverage=["source list"],
            notion_deferred=["comparable actions/projects endpoint"],
            unsupported_claims=[
                "Do not treat MLflow/local artifacts as user-facing sources."
            ],
        )
    )

    assert "Comparable project evidence is not available." in prompt
    assert "comparable actions/projects endpoint" not in prompt
    assert "MLflow/local artifacts" not in prompt
    assert "unsupported_claims" not in prompt
    assert "notion_deferred" not in prompt


def test_snapshot_prompt_requires_prominent_ask_line() -> None:
    """Snapshot prompt should require the generated ask at the top of Markdown."""
    prompt = _build_chapter_prompt(
        ReportChapterInput(
            key="snapshot",
            title="Snapshot",
            language="en",
            facts={
                "ask": {
                    "summary": (
                        "Provide technical assistance to install efficient "
                        "streetlights."
                    )
                },
                "action": {"action_id": "A_1", "name": "Street lighting upgrade"},
                "ranking": {"rank": 1, "returned_action_count": 5},
            },
            source_refs=["ranking_snapshot"],
        )
    )

    assert "terminology.ask_label" in prompt
    assert "express the meaning of `facts.ask` fluently" in prompt
    assert "Provide technical assistance to install efficient streetlights." in prompt


def test_report_prompts_require_feedback_table_structures() -> None:
    """Each revised chapter prompt should name its reader-facing table contract."""
    expected_by_key = {
        "snapshot": "What we checked | Reading | Detail",
        "city_fit": "Indicator | City's value | What it implies",
        "policy_backing": "Document | Page | Signal | What the document says",
        "legal_mandate_delivery": (
            "What the city can do alone | What needs another level of government"
        ),
        "financing_precedents_pathway": (
            "Opportunity | Funder | Support | Status | How the city could engage | Link"
        ),
        "sources_assumptions": "Category | Source",
    }

    for key, expected_contract in expected_by_key.items():
        prompt = _build_chapter_prompt(
            ReportChapterInput(
                key=key,  # type: ignore[arg-type]
                title=key.replace("_", " ").title(),
                language="en",
            )
        )
        assert expected_contract in prompt


def test_sources_prompt_omits_missing_link_placeholders() -> None:
    """Source references should remain readable when optional URLs are absent."""
    prompt = _build_chapter_prompt(
        ReportChapterInput(
            key="sources_assumptions",
            title="Where The Information Comes From",
            language="en",
            facts={
                "categorized_sources": [
                    {
                        "category": "Prioritization",
                        "name": "City action prioritization analysis for this report",
                    },
                    {
                        "category": "Legal mandate",
                        "name": "Ley 18.695 (LOCM) - BCN",
                    },
                ]
            },
        )
    )

    assert "Never add a separate Link column" in prompt
    assert "Missing optional hyperlinks are not evidence limitations" in prompt


def test_system_prompt_requires_finished_report_language() -> None:
    """Generated prose must not narrate model inputs or backend preparation."""
    prompt = _read_system_prompt()

    assert "finished report that a municipal reader will see" in prompt
    assert "Never describe facts as supplied" in prompt
    assert "Say information is `not available` rather than `not supplied`" in prompt
    assert "Never mix languages" in prompt
    assert "exact recurring UI terminology" in prompt


def test_aggregate_localized_chapters_requires_complete_language_coverage() -> None:
    """Aggregation should expose every frontend field under every requested language."""
    chapters = aggregate_localized_chapters(
        languages=["en", "es"],
        chapters_by_language={
            "en": [
                ReportChapterDraft(
                    key="snapshot",
                    title="Snapshot",
                    markdown="English report content for the selected city action.",
                    source_refs=["city"],
                    limitations=["An English limitation."],
                )
            ],
            "es": [
                ReportChapterDraft(
                    key="snapshot",
                    title="Resumen",
                    markdown="Contenido en español del informe para la acción seleccionada.",
                    source_refs=["city"],
                    limitations=["Una limitación en español."],
                )
            ],
        },
    )

    assert chapters[0].title == {"en": "Snapshot", "es": "Resumen"}
    assert set(chapters[0].markdown) == {"en", "es"}
    assert set(chapters[0].limitations) == {"en", "es"}
    assert chapters[0].source_refs == ["city"]


def test_language_validation_rejects_clearly_wrong_dominant_language() -> None:
    """A Spanish chapter must not pass validation when its prose is English."""
    output = report_generation.OutputPlanChapterResponse(
        markdown=(
            "This chapter is written entirely in English and describes the city "
            "action, its expected result, and the next implementation steps."
        ),
        source_refs=["city"],
        limitations=[],
    )

    with pytest.raises(ValueError, match="instead of `es`"):
        _validate_chapter_output(
            output,
            ReportChapterInput(
                key="snapshot",
                title="Resumen",
                language="es",
                source_refs=["city"],
            ),
        )
