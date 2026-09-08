"""Bounded chapter planning and mandatory independent semantic review."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, RunConfig, Runner
from app.config.settings import Settings
from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    ChapterEditReview,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_validation import prior_user_inputs
from app.services.openrouter_client import build_openrouter_client_options
from app.utils.cnb_observability import protect_cnb_client
from app.utils.prompt_budget import count_prompt_tokens
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class ConceptNoteEditPlanner:
    """Use the existing OpenRouter integration and reject ungrounded replacements."""

    def __init__(self, settings: Settings, *, runner: Any = Runner) -> None:
        """Accept an SDK-compatible runner so tests never call a live model."""
        self._settings = settings
        self._runner = runner

    async def plan(
        self,
        request: EditProposalRequest,
        chapters: list[WorkspaceChapterSnapshot],
        run_context: dict[str, Any],
        *,
        prior_proposal: EditProposalResponse | None = None,
        recent_messages: list[dict[str, str]] | None = None,
    ) -> EditPlanOutput:
        """Plan each unlocked chapter concurrently, then combine one review proposal."""
        prompt = self._settings.llm.prompts.get_prompt("cnb_chat_edit_planner")
        model = (
            self._settings.llm.models.cnb_chat_edit_planner
            or self._settings.llm.models.cnb_source_synthesizer
        )
        budget = self._settings.llm.generation.prompt_budget
        editable_chapters = sorted(
            (
                chapter
                for chapter in chapters
                if chapter.body_markdown is not None and not chapter.user_locked
            ),
            key=lambda chapter: chapter.position,
        )
        if not editable_chapters:
            return EditPlanOutput(
                intent="clarification",
                clarification="This draft has no unlocked chapters to edit.",
            )

        # Build and measure every isolated payload before starting billable model work.
        chapter_payloads = [
            (
                chapter,
                build_planner_input(
                    request,
                    chapter,
                    run_context,
                    prior_proposal=prior_proposal,
                    recent_messages=recent_messages,
                ),
            )
            for chapter in editable_chapters
        ]
        for _, payload in chapter_payloads:
            if (
                count_prompt_tokens(
                    [prompt, payload],
                    model=model.name,
                    fallback_encoding=budget.tokenizer_encoding,
                ).tokens
                > budget.cnb_edits.max_prompt_tokens
            ):
                raise EditOperationError(
                    "context_limit",
                    "One chapter exceeds the automatic edit context limit.",
                    status_code=422,
                )

        # The model can only return a typed proposal; there are no apply tools.
        options = build_openrouter_client_options(
            self._settings,
            missing_api_key_message="The configured edit model is unavailable",
            error_cls=RuntimeError,
        )
        client = protect_cnb_client(AsyncOpenAI(**options.kwargs))
        try:
            agent = Agent(
                name="Concept Note chapter edit planner",
                instructions=prompt,
                model=OpenAIChatCompletionsModel(
                    model=model.name, openai_client=client
                ),
                model_settings=ModelSettings(
                    temperature=0.0,
                    include_usage=True,
                    reasoning={"effort": model.reasoning_effort},
                ),
                output_type=ChapterEditPlanOutput,
            )
            run_config = RunConfig(
                tracing_disabled=True, trace_include_sensitive_data=False
            )
            reviewer = agent.clone(
                name="Concept Note edit semantic reviewer",
                instructions=self._settings.llm.prompts.get_prompt(
                    "cnb_chat_edit_review"
                ),
                output_type=ChapterEditReview,
            )
            limit = asyncio.Semaphore(budget.cnb_edits.max_concurrency)

            async def plan_chapter(
                payload: dict[str, Any],
            ) -> tuple[ChapterEditPlanOutput, ChapterEditReview | None]:
                """Plan and independently review meaning under one concurrency limit."""
                async with limit:
                    result = await self._runner.run(
                        agent,
                        json.dumps(payload, ensure_ascii=False),
                        run_config=run_config,
                    )
                    raw = result.final_output
                    plan = (
                        ChapterEditPlanOutput.model_validate_json(raw)
                        if isinstance(raw, str)
                        else ChapterEditPlanOutput.model_validate(raw)
                    )
                    if not plan.changes:
                        return plan, None

                    # Review the actual output, not the planner's own safety claim.
                    review_payload = {
                        **payload,
                        "changes": [change.model_dump() for change in plan.changes],
                    }
                    if (
                        count_prompt_tokens(
                            [reviewer.instructions, review_payload],
                            model=model.name,
                            fallback_encoding=budget.tokenizer_encoding,
                        ).tokens
                        > budget.cnb_edits.max_prompt_tokens
                    ):
                        raise EditOperationError(
                            "context_limit",
                            "The edit review exceeds the chapter context limit.",
                            status_code=422,
                        )
                    reviewed = await self._runner.run(
                        reviewer,
                        json.dumps(review_payload, ensure_ascii=False),
                        run_config=run_config,
                    )
                    raw_review = reviewed.final_output
                    review = (
                        ChapterEditReview.model_validate_json(raw_review)
                        if isinstance(raw_review, str)
                        else ChapterEditReview.model_validate(raw_review)
                    )
                    return plan, review

            # Await every worker before closing the shared client or surfacing an error.
            logger.info(
                "Planning Concept Note edits chapter by chapter",
                extra={
                    "chapter_count": len(chapter_payloads),
                    "max_concurrency": budget.cnb_edits.max_concurrency,
                },
            )
            results = await asyncio.gather(
                *(plan_chapter(payload) for _, payload in chapter_payloads),
                return_exceptions=True,
            )
            chapter_plans: list[ChapterEditPlanOutput] = []
            reviews: list[ChapterEditReview | None] = []
            for result in results:
                if isinstance(result, BaseException):
                    raise result
                chapter_plan, review = result
                chapter_plans.append(chapter_plan)
                reviews.append(review)
            combined = combine_chapter_plans(editable_chapters, chapter_plans)
            return bind_semantic_reviews(combined, chapter_plans, reviews)
        finally:
            await client.close()


def build_planner_input(
    request: EditProposalRequest,
    chapter: WorkspaceChapterSnapshot,
    run_context: dict[str, Any],
    *,
    prior_proposal: EditProposalResponse | None = None,
    recent_messages: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Expose one chapter while excluding document-wide and storage metadata."""
    return {
        "instruction": request.instruction,
        "recent_messages": [
            {"role": message["role"], "content": message["content"]}
            for message in (recent_messages or [])
            if message.get("role") in {"user", "assistant"}
            and isinstance(message.get("content"), str)
            and message["content"].strip()
        ][-3:],
        "is_focused_chapter": request.scope.focused_chapter_id == chapter.chapter_id,
        "chapter": {
            "title": chapter.title,
            "position": chapter.position,
            "body_markdown": chapter.body_markdown,
            "confirmed_body_markdown": chapter.confirmed_body_markdown,
            "gaps": [
                {"question": gap.question, "state": gap.state} for gap in chapter.gaps
            ],
        },
        "run_context": {
            key: run_context[key]
            for key in (
                "selected_sources",
                "cc_context",
                "funder_context",
                "document_context",
                "similar_projects",
            )
            if key in run_context
        },
        "prior_proposal": (
            None
            if prior_proposal is None
            else {
                "instruction": prior_proposal.instruction,
                "user_inputs": prior_user_inputs(prior_proposal),
                "clarification": prior_proposal.clarification,
                "changes": [
                    {
                        key: value
                        for key, value in change.model_dump(mode="json").items()
                        if key
                        in {
                            "start",
                            "before",
                            "after",
                            "kind",
                            "group_id",
                            "source_refs",
                            "user_input_quote",
                        }
                    }
                    for change in prior_proposal.changes
                    if change.chapter_id == chapter.chapter_id
                ],
            }
        ),
    }


def bind_semantic_reviews(
    combined: EditPlanOutput,
    plans: list[ChapterEditPlanOutput],
    reviews: list[ChapterEditReview | None],
) -> EditPlanOutput:
    """Bind complete independent decisions to exact changes, never to model IDs."""
    if combined.intent != "edit":
        return combined
    changes = []
    for plan, review in zip(plans, reviews, strict=True):
        if not plan.changes:
            continue
        if review is None or sorted(d.change_index for d in review.decisions) != list(
            range(len(plan.changes))
        ):
            raise EditOperationError(
                "invalid_review",
                "The proposal did not receive a complete semantic review.",
                status_code=422,
            )
        for decision in sorted(review.decisions, key=lambda d: d.change_index):
            if decision.support == "unsupported":
                raise EditOperationError(
                    "unsupported_edit",
                    "The proposal changed meaning beyond the instruction. Please retry the edit.",
                    status_code=422,
                )
            change = combined.changes[len(changes)]
            changes.append(
                change.model_copy(update={"semantic_support": decision.support})
            )
    return combined.model_copy(update={"changes": changes})


def combine_chapter_plans(
    chapters: list[WorkspaceChapterSnapshot],
    plans: list[ChapterEditPlanOutput],
) -> EditPlanOutput:
    """Bind isolated model outputs to chapters and assemble one bounded plan."""
    if len(chapters) != len(plans):
        raise ValueError("each chapter must have exactly one planner result")

    # A clarification blocks partial edits so the request is never silently narrowed.
    for plan in plans:
        if plan.intent == "clarification":
            return EditPlanOutput(
                intent="clarification", clarification=plan.clarification
            )

    # Bind server-owned chapter identity and isolate model group labels per chapter.
    changes: list[PlannedTextChange] = []
    for chapter, plan in zip(chapters, plans, strict=True):
        group_ids: dict[str, str] = {}
        for change in plan.changes:
            group_ids.setdefault(
                change.group_id,
                f"chapter-{chapter.position}-group-{len(group_ids) + 1}",
            )
            changes.append(
                PlannedTextChange(
                    **change.model_dump(exclude={"group_id"}),
                    chapter_id=chapter.chapter_id,
                    group_id=group_ids[change.group_id],
                )
            )
    if len(changes) > 100:
        raise EditOperationError(
            "context_limit",
            "This request affects more than 100 exact passages. "
            "Split it into smaller edits.",
            status_code=422,
        )
    if changes:
        return EditPlanOutput(intent="edit", changes=changes)
    if any(plan.intent == "question" for plan in plans):
        return EditPlanOutput(intent="question")
    return EditPlanOutput(
        intent="clarification",
        clarification="No matching editable passage was found. What should change?",
    )
