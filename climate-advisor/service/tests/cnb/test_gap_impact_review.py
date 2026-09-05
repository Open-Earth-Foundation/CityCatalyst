from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.gap_impact_review import (
    ConceptNoteGapImpactReviewer,
    build_gap_impact_review_partitions,
)
from app.tools.concept_note_gap_review_tools import (
    build_concept_note_gap_review_tools,
)


def _chapter(number: int, body: str) -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=f"chapter-{number}",
        title=f"Chapter {number}",
        position=number - 1,
        status="draft",
        required=True,
        user_locked=False,
        body_markdown=body,
        gaps=[],
        revision_id=uuid4(),
        revision_number=1,
        confirmed_body_markdown=None,
        confirmed_revision_number=None,
        proposed_revision_number=None,
        regeneration_status="idle",
        regeneration_error=None,
    )


NEW_INFORMATION = {
    "source_chapter_number": 1,
    "field_key": "opening_date",
    "question": "Confirm the opening date.",
    "answer": "1 January 2029",
    "action": "answer",
}


def test_impact_review_uses_all_full_chapters_when_they_fit() -> None:
    chapters = [_chapter(2, "Short text"), _chapter(3, "Other short text")]

    partitions = build_gap_impact_review_partitions(
        chapters=chapters,
        new_information=NEW_INFORMATION,
        prompt="Review chapters.",
        model=None,
        tokenizer_encoding="o200k_base",
        max_prompt_tokens=10_000,
        max_chapter_slice_tokens=100,
    )

    assert len(partitions) == 1
    assert partitions[0]["coverage"] == "full"
    assert [item["chapter_number"] for item in partitions[0]["chapters"]] == [2, 3]
    assert [item["body_markdown"] for item in partitions[0]["chapters"]] == [
        "Short text",
        "Other short text",
    ]


def test_impact_review_slices_losslessly_and_covers_every_chapter() -> None:
    bodies = {
        2: "alpha beta gamma delta " * 80,
        3: "one two three four " * 80,
    }
    partitions = build_gap_impact_review_partitions(
        chapters=[_chapter(number, body) for number, body in bodies.items()],
        new_information=NEW_INFORMATION,
        prompt="Review chapters.",
        model=None,
        tokenizer_encoding="o200k_base",
        max_prompt_tokens=350,
        max_chapter_slice_tokens=50,
    )

    assert len(partitions) > 1
    assert all(partition["coverage"] == "sliced" for partition in partitions)
    slices = [item for partition in partitions for item in partition["chapters"]]
    assert {item["chapter_number"] for item in slices} == {2, 3}
    for chapter_number, body in bodies.items():
        chapter_slices = sorted(
            (item for item in slices if item["chapter_number"] == chapter_number),
            key=lambda item: item["slice_index"],
        )
        assert "".join(item["body_markdown"] for item in chapter_slices) == body
        assert all(
            item["slice_count"] == len(chapter_slices) for item in chapter_slices
        )


def test_impact_selector_is_a_separate_single_purpose_tool() -> None:
    [tool] = build_concept_note_gap_review_tools(allowed_chapter_numbers={2, 3})

    assert tool.name == "select_chapters_for_rewrite"


async def test_reviewer_loads_only_selector_tool_and_parses_number_array(
    monkeypatch,
) -> None:
    """Force one tool call in the review agent and accept no prose-shaped output."""
    captured: dict[str, object] = {}

    def agent_factory(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(**kwargs)

    class FakeClient:
        async def close(self):
            return None

    settings = SimpleNamespace(
        llm=SimpleNamespace(
            models=SimpleNamespace(
                cnb_gap_impact_reviewer=SimpleNamespace(
                    name="review-model",
                    reasoning_effort="medium",
                ),
                cnb_source_synthesizer=None,
            ),
            prompts=SimpleNamespace(get_prompt=lambda _: "Review chapters."),
            generation=SimpleNamespace(
                prompt_budget=SimpleNamespace(
                    tokenizer_encoding="o200k_base",
                    cnb_gap_impact=SimpleNamespace(
                        max_prompt_tokens=10_000,
                        max_chapter_slice_tokens=100,
                    ),
                )
            ),
        )
    )
    runner = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(final_output="[2]"))
    )
    monkeypatch.setattr("app.services.cnb.gap_impact_review.Agent", agent_factory)
    monkeypatch.setattr(
        "app.services.cnb.gap_impact_review.OpenAIChatCompletionsModel",
        lambda **kwargs: kwargs,
    )
    monkeypatch.setattr(
        "app.services.cnb.gap_impact_review.AsyncOpenAI",
        lambda **_: FakeClient(),
    )
    monkeypatch.setattr(
        "app.services.cnb.gap_impact_review.build_openrouter_client_options",
        lambda *_args, **_kwargs: SimpleNamespace(kwargs={}),
    )

    selected = await ConceptNoteGapImpactReviewer(
        settings, runner=runner
    ).select_chapters(
        chapters=[_chapter(2, "Timeline text")],
        new_information=NEW_INFORMATION,
    )

    assert selected == [2]
    assert captured["tool_use_behavior"] == "stop_on_first_tool"
    assert len(captured["tools"]) == 1
    assert captured["tools"][0].name == "select_chapters_for_rewrite"
    assert captured["model_settings"].tool_choice == "select_chapters_for_rewrite"
