"""Review-only LLM selection of chapters affected by one confirmed answer."""

from __future__ import annotations

import json
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.concept_note_gap_review_tools import (
    build_concept_note_gap_review_tools,
)
from app.utils.prompt_budget import count_prompt_tokens, split_text_by_tokens
from openai import AsyncOpenAI


class GapImpactReviewError(Exception):
    """Raised when the bounded chapter-impact review cannot be completed."""


class ConceptNoteGapImpactReviewer:
    """Partition chapter content and return only selected chapter numbers."""

    def __init__(self, settings: Settings, *, runner: Any = Runner) -> None:
        self._settings = settings
        self._runner = runner

    async def select_chapters(
        self,
        *,
        chapters: list[WorkspaceChapterSnapshot],
        new_information: dict[str, Any],
    ) -> list[int]:
        """Review all supplied content, slicing losslessly when it cannot fit."""
        model_config = (
            self._settings.llm.models.cnb_gap_impact_reviewer
            or self._settings.llm.models.cnb_source_synthesizer
        )
        prompt = self._settings.llm.prompts.get_prompt("cnb_gap_impact_review")
        prompt_budget = self._settings.llm.generation.prompt_budget
        review_budget = prompt_budget.cnb_gap_impact
        partitions = build_gap_impact_review_partitions(
            chapters=chapters,
            new_information=new_information,
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
                "OpenRouter API key is required for Concept Note gap impact review"
            ),
            error_cls=GapImpactReviewError,
        )
        client = AsyncOpenAI(**options.kwargs)
        selected: set[int] = set()
        allowed = {
            chapter.position + 1
            for chapter in chapters
            if chapter.body_markdown is not None
        }
        try:
            for payload in partitions:
                partition_numbers = {
                    int(item["chapter_number"]) for item in payload["chapters"]
                }
                tools = build_concept_note_gap_review_tools(
                    allowed_chapter_numbers=partition_numbers,
                )
                agent = Agent(
                    name="Concept Note gap impact reviewer",
                    instructions=prompt,
                    model=OpenAIChatCompletionsModel(
                        model=model_config.name,
                        openai_client=client,
                    ),
                    model_settings=ModelSettings(
                        temperature=0.0,
                        include_usage=True,
                        reasoning={"effort": model_config.reasoning_effort},
                        tool_choice="select_chapters_for_rewrite",
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
                    raise GapImpactReviewError(
                        "Gap impact reviewer returned an invalid chapter list"
                    )
                if set(parsed) - partition_numbers:
                    raise GapImpactReviewError(
                        "Gap impact reviewer selected an unavailable chapter"
                    )
                selected.update(parsed)
        finally:
            await client.close()
        return sorted(selected.intersection(allowed))


def build_gap_impact_review_partitions(
    *,
    chapters: list[WorkspaceChapterSnapshot],
    new_information: dict[str, Any],
    prompt: str,
    model: str | None,
    tokenizer_encoding: str,
    max_prompt_tokens: int,
    max_chapter_slice_tokens: int,
) -> list[dict[str, Any]]:
    """Use full chapters when possible, otherwise cover every token in slices."""
    whole_records = [
        {
            "chapter_number": chapter.position + 1,
            "title": chapter.title,
            "body_markdown": chapter.body_markdown,
            "slice_index": 1,
            "slice_count": 1,
        }
        for chapter in chapters
        if chapter.body_markdown is not None
    ]
    if not whole_records:
        return []

    full_payload = {
        "new_information": new_information,
        "coverage": "full",
        "chapters": whole_records,
    }
    if (
        _payload_tokens(
            full_payload,
            prompt=prompt,
            model=model,
            tokenizer_encoding=tokenizer_encoding,
        )
        <= max_prompt_tokens
    ):
        return [full_payload]

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
        candidate = {
            "new_information": new_information,
            "coverage": "sliced",
            "chapters": [*current, record],
        }
        if (
            current
            and _payload_tokens(
                candidate,
                prompt=prompt,
                model=model,
                tokenizer_encoding=tokenizer_encoding,
            )
            > max_prompt_tokens
        ):
            partitions.append(
                {
                    "new_information": new_information,
                    "coverage": "sliced",
                    "chapters": current,
                }
            )
            current = [record]
        else:
            current.append(record)
    if current:
        partitions.append(
            {
                "new_information": new_information,
                "coverage": "sliced",
                "chapters": current,
            }
        )

    if any(
        _payload_tokens(
            partition,
            prompt=prompt,
            model=model,
            tokenizer_encoding=tokenizer_encoding,
        )
        > max_prompt_tokens
        for partition in partitions
    ):
        raise GapImpactReviewError("Gap impact review slice exceeds prompt budget")
    return partitions


def _payload_tokens(
    payload: dict[str, Any],
    *,
    prompt: str,
    model: str | None,
    tokenizer_encoding: str,
) -> int:
    return count_prompt_tokens(
        [prompt, payload],
        model=model,
        fallback_encoding=tokenizer_encoding,
    ).tokens
