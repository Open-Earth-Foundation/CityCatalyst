from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.models.cnb.context_bundle import SelectedSource
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.source_impact_review import (
    ConceptNoteSourceImpactReviewer,
    build_source_impact_review_partitions,
)
from app.tools.concept_note_source_impact_tools import (
    build_concept_note_source_impact_tools,
)

NEW_SOURCE = SelectedSource(
    upload_id=uuid4(),
    source_label="Technical update",
    filename="technical-update.md",
    sha256="a" * 64,
    source_format="markdown",
    block_count=3,
    summary="Seven new stops and the EIB financing request.",
    topics=["stops", "financing"],
    key_excerpts=[{"text": "Seven new tram stops.", "anchor": "project-components"}],
)


def _chapter(number: int, body: str, status: str = "draft") -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=f"chapter-{number}",
        title=f"Chapter {number}",
        position=number - 1,
        status=status,
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_id=uuid4(),
        revision_number=1,
    )


def test_source_review_uses_all_full_chapters_when_they_fit() -> None:
    """Send whole chapters, their status, and the new source summary in one call."""
    partitions = build_source_impact_review_partitions(
        chapters=[_chapter(1, "Summary", status="ready"), _chapter(2, "Components")],
        new_sources=[NEW_SOURCE],
        prompt="Review chapters.",
        model=None,
        tokenizer_encoding="o200k_base",
        max_prompt_tokens=10_000,
        max_chapter_slice_tokens=100,
    )

    [partition] = partitions
    assert partition["coverage"] == "full"
    assert partition["new_sources"] == [
        {
            "source_label": "Technical update",
            "summary": "Seven new stops and the EIB financing request.",
            "topics": ["stops", "financing"],
            "key_excerpts": ["Seven new tram stops."],
        }
    ]
    assert [item["chapter_number"] for item in partition["chapters"]] == [1, 2]
    assert [item["status"] for item in partition["chapters"]] == ["ready", "draft"]


def test_source_review_slices_losslessly_and_covers_every_chapter() -> None:
    """Split long chapters so every token reaches some bounded review call."""
    bodies = {
        2: "alpha beta gamma delta " * 80,
        3: "one two three four " * 80,
    }
    partitions = build_source_impact_review_partitions(
        chapters=[_chapter(number, body) for number, body in bodies.items()],
        new_sources=[NEW_SOURCE],
        prompt="Review chapters.",
        model=None,
        tokenizer_encoding="o200k_base",
        max_prompt_tokens=450,
        max_chapter_slice_tokens=50,
    )

    assert len(partitions) > 1
    assert all(partition["coverage"] == "sliced" for partition in partitions)
    slices = [item for partition in partitions for item in partition["chapters"]]
    for chapter_number, body in bodies.items():
        chapter_slices = sorted(
            (item for item in slices if item["chapter_number"] == chapter_number),
            key=lambda item: item["slice_index"],
        )
        assert "".join(item["body_markdown"] for item in chapter_slices) == body


def test_source_selector_is_a_single_purpose_tool() -> None:
    """Expose exactly one selector tool to the review-only call."""
    [tool] = build_concept_note_source_impact_tools(allowed_chapter_numbers={2, 3})

    assert tool.name == "select_chapters_to_update"


async def test_source_reviewer_forces_one_tool_call_and_parses_numbers(
    monkeypatch,
) -> None:
    """Force the selector tool and accept only a chapter-number array."""
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
                cnb_source_impact_reviewer=SimpleNamespace(
                    name="review-model",
                    reasoning_effort="medium",
                ),
                cnb_source_synthesizer=None,
            ),
            prompts=SimpleNamespace(get_prompt=lambda _: "Review chapters."),
            generation=SimpleNamespace(
                prompt_budget=SimpleNamespace(
                    tokenizer_encoding="o200k_base",
                    cnb_source_impact=SimpleNamespace(
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
    module = "app.services.cnb.source_impact_review"
    monkeypatch.setattr(f"{module}.Agent", agent_factory)
    monkeypatch.setattr(
        f"{module}.OpenAIChatCompletionsModel", lambda **kwargs: kwargs
    )
    monkeypatch.setattr(f"{module}.AsyncOpenAI", lambda **_: FakeClient())
    monkeypatch.setattr(
        f"{module}.build_openrouter_client_options",
        lambda *_args, **_kwargs: SimpleNamespace(kwargs={}),
    )

    selected = await ConceptNoteSourceImpactReviewer(
        settings, runner=runner
    ).select_chapters(
        chapters=[_chapter(1, "Summary"), _chapter(2, "Components")],
        new_sources=[NEW_SOURCE],
    )

    assert selected == [2]
    assert captured["tool_use_behavior"] == "stop_on_first_tool"
    assert [tool.name for tool in captured["tools"]] == ["select_chapters_to_update"]
    assert captured["model_settings"].tool_choice == "select_chapters_to_update"
