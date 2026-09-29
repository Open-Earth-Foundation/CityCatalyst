"""Review-only LLM selection of chapters affected by newly analyzed sources."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings
from app.models.cnb.context_bundle import SelectedSource
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.source_analysis import SourceUnit
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.concept_note_source_impact_tools import (
    build_concept_note_source_impact_tools,
)
from app.utils.prompt_budget import count_prompt_tokens, split_text_by_tokens
from openai import AsyncOpenAI


class SourceImpactReviewError(Exception):
    """Raised when the bounded source-impact review cannot be completed."""


@dataclass(frozen=True)
class RevalidationSource:
    """One newly analyzed source with its verified text for focused gap queries."""

    source: SelectedSource
    units: list[SourceUnit]


class ConceptNoteSourceImpactReviewer:
    """Partition chapter content and return only the chapters a source affects."""

    def __init__(self, settings: Settings, *, runner: Any = Runner) -> None:
        self._settings = settings
        self._runner = runner

    async def select_chapters(
        self,
        *,
        chapters: list[WorkspaceChapterSnapshot],
        new_sources: list[SelectedSource],
    ) -> list[int]:
        """Review all drafted chapters, slicing losslessly when they cannot fit."""
        model_config = (
            self._settings.llm.models.cnb_source_impact_reviewer
            or self._settings.llm.models.cnb_source_synthesizer
        )
        prompt = self._settings.llm.prompts.get_prompt("cnb_source_impact_review")
        prompt_budget = self._settings.llm.generation.prompt_budget
        review_budget = prompt_budget.cnb_source_impact
        partitions = build_source_impact_review_partitions(
            chapters=chapters,
            new_sources=new_sources,
            prompt=prompt,
            model=model_config.name,
            tokenizer_encoding=prompt_budget.tokenizer_encoding,
            max_prompt_tokens=review_budget.max_prompt_tokens,
            max_chapter_slice_tokens=review_budget.max_chapter_slice_tokens,
        )
        if not partitions:
            return []

        options = build_openrouter_client_options(
            self._settings,
            missing_api_key_message=(
                "OpenRouter API key is required for Concept Note source impact review"
            ),
            error_cls=SourceImpactReviewError,
        )
        client = AsyncOpenAI(**options.kwargs)
        selected: set[int] = set()
        try:
            for payload in partitions:
                partition_numbers = {
                    int(item["chapter_number"]) for item in payload["chapters"]
                }
                tools = build_concept_note_source_impact_tools(
                    allowed_chapter_numbers=partition_numbers,
                )
                agent = Agent(
                    name="Concept Note source impact reviewer",
                    instructions=prompt,
                    model=OpenAIChatCompletionsModel(
                        model=model_config.name,
                        openai_client=client,
                    ),
                    model_settings=ModelSettings(
                        temperature=0.0,
                        include_usage=True,
                        reasoning={"effort": model_config.reasoning_effort},
                        tool_choice="select_chapters_to_update",
                        parallel_tool_calls=False,
                    ),
                    tools=list(tools),
                    tool_use_behavior="stop_on_first_tool",
                )
                result = await self._runner.run(
                    agent,
                    json.dumps(payload, ensure_ascii=False),
                )
                raw = result.final_output
                parsed = json.loads(raw) if isinstance(raw, str) else raw
                if not isinstance(parsed, list) or not all(
                    isinstance(number, int) for number in parsed
                ):
                    raise SourceImpactReviewError(
                        "Source impact reviewer returned an invalid chapter list"
                    )
                if set(parsed) - partition_numbers:
                    raise SourceImpactReviewError(
                        "Source impact reviewer selected an unavailable chapter"
                    )
                selected.update(parsed)
        finally:
            await client.close()
        return sorted(selected)


def build_source_impact_review_partitions(
    *,
    chapters: list[WorkspaceChapterSnapshot],
    new_sources: list[SelectedSource],
    prompt: str,
    model: str | None,
    tokenizer_encoding: str,
    max_prompt_tokens: int,
    max_chapter_slice_tokens: int,
) -> list[dict[str, Any]]:
    """Use full chapters when possible, otherwise cover every token in slices."""
    source_records = [
        {
            "source_label": source.source_label,
            "summary": source.summary,
            "topics": list(source.topics),
            "key_excerpts": [excerpt.text for excerpt in source.key_excerpts],
        }
        for source in new_sources
    ]
    whole_records = [
        {
            "chapter_number": chapter.position + 1,
            "title": chapter.title,
            "status": chapter.status,
            "open_gaps": [gap.question for gap in chapter.gaps if gap.state == "open"],
            "body_markdown": chapter.body_markdown,
            "slice_index": 1,
            "slice_count": 1,
        }
        for chapter in chapters
        if chapter.body_markdown is not None
    ]
    if not whole_records or not source_records:
        return []

    def payload(coverage: str, records: list[dict[str, Any]]) -> dict[str, Any]:
        return {"new_sources": source_records, "coverage": coverage, "chapters": records}

    def tokens(value: dict[str, Any]) -> int:
        return count_prompt_tokens(
            [prompt, value],
            model=model,
            fallback_encoding=tokenizer_encoding,
        ).tokens

    full_payload = payload("full", whole_records)
    if tokens(full_payload) <= max_prompt_tokens:
        return [full_payload]

    # Split long chapters so every token is reviewed in some bounded call.
    sliced_records: list[dict[str, Any]] = []
    for record in whole_records:
        slices = split_text_by_tokens(
            str(record["body_markdown"]),
            max_tokens=max_chapter_slice_tokens,
            model=model,
            fallback_encoding=tokenizer_encoding,
        )
        for index, text in enumerate(slices, start=1):
            sliced_records.append(
                {
                    **record,
                    "body_markdown": text,
                    "slice_index": index,
                    "slice_count": len(slices),
                }
            )

    partitions: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    for record in sliced_records:
        if current and tokens(payload("sliced", [*current, record])) > max_prompt_tokens:
            partitions.append(payload("sliced", current))
            current = [record]
        else:
            current.append(record)
    if current:
        partitions.append(payload("sliced", current))

    if any(tokens(partition) > max_prompt_tokens for partition in partitions):
        raise SourceImpactReviewError(
            "Source impact review slice exceeds prompt budget"
        )
    return partitions
