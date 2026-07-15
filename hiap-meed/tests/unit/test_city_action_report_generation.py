"""Unit tests for output-plan report generation helpers."""

from __future__ import annotations

from app.modules.prioritizer.report_models import ReportChapterInput
from app.modules.prioritizer.services.report_generation import (
    _build_chapter_prompt,
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
