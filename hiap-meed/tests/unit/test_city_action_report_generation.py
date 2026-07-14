"""Unit tests for output-plan report generation helpers."""

from __future__ import annotations

from app.modules.prioritizer.report_models import ReportChapterInput
from app.modules.prioritizer.services.report_generation import (
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
