"""Agentic draft search and replacement with mandatory independent semantic review."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from agents import Agent, OpenAIChatCompletionsModel, RunConfig, Runner
from agents.exceptions import MaxTurnsExceeded
from openai import AsyncOpenAI

from app.config.settings import Settings
from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    ChapterEditReview,
    EditAgentOutput,
    EditPlanOutput,
    EditProposalRequest,
    EditProposalResponse,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_session import DraftEditSession
from app.services.cnb.edit_validation import prior_user_inputs, recent_user_inputs
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.concept_note_draft_tools import build_draft_tools
from app.utils.cnb_model_settings import cnb_model_settings
from app.utils.cnb_observability import protect_cnb_client
from app.utils.cnb_progress import emit_cnb_progress, run_with_cnb_reasoning
from app.utils.concept_note_context import omit_context_identifiers
from app.utils.prompt_budget import count_prompt_tokens

logger = logging.getLogger(__name__)


class ConceptNoteEditPlanner:
    """Let the agent choose edits while snapshot-bound tools resolve exact anchors."""

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
        """Bound the complete tool loop and semantic review by one operation deadline."""
        try:
            async with asyncio.timeout(
                self._settings.llm.generation.prompt_budget.cnb_edits.timeout_seconds
            ):
                return await self._plan(
                    request, chapters, run_context, prior_proposal, recent_messages
                )
        except TimeoutError:
            raise EditOperationError(
                "planning_timeout",
                "The edit exceeded its time limit. Retry with a smaller scope.",
                status_code=504,
            ) from None
        except MaxTurnsExceeded:
            raise EditOperationError(
                "planning_limit",
                "The edit could not be resolved within the tool limit. Narrow the requested change.",
                status_code=422,
            ) from None

    async def _plan(
        self,
        request: EditProposalRequest,
        chapters: list[WorkspaceChapterSnapshot],
        run_context: dict[str, Any],
        prior_proposal: EditProposalResponse | None,
        recent_messages: list[dict[str, str]] | None,
    ) -> EditPlanOutput:
        """Search and propose once per document, then review only affected chapters."""
        prompt = self._settings.llm.prompts.get_prompt("cnb_chat_edit_planner")
        model = (
            self._settings.llm.models.cnb_chat_edit_planner
            or self._settings.llm.models.cnb_source_synthesizer
        )
        budget = self._settings.llm.generation.prompt_budget
        chapters = sorted(
            (c for c in chapters if c.body_markdown is not None),
            key=lambda c: c.position,
        )
        if not any(not chapter.user_locked for chapter in chapters):
            return EditPlanOutput(
                intent="clarification",
                clarification="This draft has no unlocked chapters to edit.",
            )

        # Keep source and prior-proposal projection identical for tools and review.
        chapter_inputs = {
            chapter.position: build_planner_input(
                request,
                chapter,
                run_context,
                prior_proposal=prior_proposal,
                recent_messages=recent_messages,
            )
            for chapter in chapters
        }
        first = chapter_inputs[chapters[0].position]
        payload = {
            "instruction": request.instruction,
            "recent_messages": first["recent_messages"],
            "run_context": first["run_context"],
            "chapters": [
                {
                    "position": chapter.position,
                    "title": chapter.title,
                    "revision": chapter.revision_number,
                    "locked": chapter.user_locked,
                    "focused": chapter.chapter_id == request.scope.focused_chapter_id,
                }
                for chapter in chapters
            ],
            "prior_proposal": None
            if prior_proposal is None
            else {
                "instruction": prior_proposal.instruction,
                "user_inputs": prior_user_inputs(prior_proposal),
            },
        }
        if (
            count_prompt_tokens(
                [
                    prompt,
                    payload,
                    [item["chapter"] for item in chapter_inputs.values()],
                ],
                model=model.name,
                fallback_encoding=budget.tokenizer_encoding,
            ).tokens
            > budget.cnb_edits.max_prompt_tokens
        ):
            raise EditOperationError(
                "context_limit",
                "The draft exceeds the automatic edit context limit.",
                status_code=422,
            )
        session = DraftEditSession(
            request,
            chapters,
            run_context,
            [*prior_user_inputs(prior_proposal), *recent_user_inputs(recent_messages)],
        )
        options = build_openrouter_client_options(
            self._settings,
            missing_api_key_message="The configured edit model is unavailable",
            error_cls=RuntimeError,
        )
        client = protect_cnb_client(AsyncOpenAI(**options.kwargs))
        try:
            sdk_model = OpenAIChatCompletionsModel(
                model=model.name, openai_client=client
            )
            settings = cnb_model_settings(
                model.reasoning_effort, responses=False, temperature=0.0
            )
            agent = Agent(
                name="Concept Note edit agent",
                instructions=prompt,
                model=sdk_model,
                model_settings=settings,
                tools=build_draft_tools(session, chapter_inputs),
                output_type=EditAgentOutput,
            )
            run_config = RunConfig(
                tracing_disabled=True, trace_include_sensitive_data=False
            )
            await emit_cnb_progress("planning")
            result = await run_with_cnb_reasoning(
                self._runner,
                agent,
                json.dumps(payload, ensure_ascii=False),
                run_config=run_config,
                stage="planning",
                max_turns=budget.cnb_edits.max_agent_turns,
            )
            raw = result.final_output
            outcome = (
                EditAgentOutput.model_validate_json(raw)
                if isinstance(raw, str)
                else EditAgentOutput.model_validate(raw)
            )
            if outcome.intent != "edit":
                return EditPlanOutput(
                    intent=outcome.intent, clarification=outcome.clarification
                )
            if session.plan is None:
                raise EditOperationError(
                    "invalid_plan",
                    "The edit agent did not submit a valid replacement proposal.",
                    status_code=422,
                )

            # Exact anchors and structural guards have already passed in the tool loop.
            affected = [
                chapter
                for chapter in chapters
                if any(
                    change.chapter_id == chapter.chapter_id
                    for change in session.plan.changes
                )
            ]
            plans = [
                ChapterEditPlanOutput(
                    intent="edit",
                    changes=[
                        change.model_dump(exclude={"chapter_id"})
                        for change in session.plan.changes
                        if change.chapter_id == chapter.chapter_id
                    ],
                )
                for chapter in affected
            ]
            combined = combine_chapter_plans(affected, plans).model_copy(
                update={"notices": session.plan.notices}
            )
            reviewer = Agent(
                name="Concept Note edit semantic reviewer",
                instructions=self._settings.llm.prompts.get_prompt(
                    "cnb_chat_edit_review"
                ),
                model=sdk_model,
                model_settings=settings,
                output_type=ChapterEditReview,
            )
            limit = asyncio.Semaphore(budget.cnb_edits.max_concurrency)
            completed = 0

            async def review_chapter(
                chapter: WorkspaceChapterSnapshot, plan: ChapterEditPlanOutput
            ) -> ChapterEditReview:
                """Review the actual resolved text, without any edit tools."""
                nonlocal completed
                async with limit:
                    review_payload = {
                        **chapter_inputs[chapter.position],
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
                    await emit_cnb_progress(
                        "reviewing",
                        chapter_title=chapter.title,
                        completed=completed,
                        total=len(affected),
                    )
                    reviewed = await run_with_cnb_reasoning(
                        self._runner,
                        reviewer,
                        json.dumps(review_payload, ensure_ascii=False),
                        run_config=run_config,
                        stage="reviewing",
                        chapter_title=chapter.title,
                    )
                    raw_review = reviewed.final_output
                    review = (
                        ChapterEditReview.model_validate_json(raw_review)
                        if isinstance(raw_review, str)
                        else ChapterEditReview.model_validate(raw_review)
                    )
                    # Reject a failed semantic decision before marking this chapter complete.
                    bind_semantic_reviews(
                        combine_chapter_plans([chapter], [plan]), [plan], [review]
                    )
                    completed += 1
                    await emit_cnb_progress(
                        "chapter_completed",
                        chapter_title=chapter.title,
                        completed=completed,
                        total=len(affected),
                    )
                    return review

            logger.info(
                "Reviewing agent-proposed Concept Note edits",
                extra={
                    "chapter_count": len(affected),
                    "change_count": len(combined.changes),
                },
            )
            tasks = [
                asyncio.create_task(review_chapter(chapter, plan))
                for chapter, plan in zip(affected, plans, strict=True)
            ]
            try:
                reviews = await asyncio.gather(*tasks)
            finally:
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            return bind_semantic_reviews(combined, plans, reviews)
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
    # Match source-query indices while keeping immutable identities in the backend.
    sources = run_context.get("selected_sources", [])
    source_indices = {
        (str(source.get("upload_id")), source.get("sha256")): str(index)
        for index, source in enumerate(sources, start=1)
    }
    context = {
        key: run_context[key]
        for key in (
            "cc_context",
            "funder_context",
            "document_context",
            "similar_projects",
        )
        if key in run_context
    }
    context["selected_sources"] = []
    for index, source in enumerate(sources, start=1):
        projected = {
            key: source[key]
            for key in (
                "source_label",
                "filename",
                "source_format",
                "summary",
                "topics",
            )
            if key in source
        }
        projected["source_index"] = index
        projected["key_excerpts"] = [
            {key: excerpt[key] for key in ("text", "page", "anchor") if key in excerpt}
            for excerpt in source.get("key_excerpts", [])
        ]
        context["selected_sources"].append(projected)

    # Project proposal metadata separately so model reference fields are retained.
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
            "revision": chapter.revision_number,
            "body_markdown": chapter.body_markdown,
            "confirmed_body_markdown": chapter.confirmed_body_markdown,
            "gaps": [
                {"question": gap.question, "state": gap.state} for gap in chapter.gaps
            ],
        },
        "run_context": omit_context_identifiers(context),
        "prior_proposal": (
            None
            if prior_proposal is None
            else {
                "instruction": prior_proposal.instruction,
                "user_inputs": prior_user_inputs(prior_proposal),
                "clarification": prior_proposal.clarification,
                "changes": [
                    {
                        **change.model_dump(
                            mode="json",
                            include={
                                "start",
                                "before",
                                "after",
                                "kind",
                                "group_id",
                                "user_input_quote",
                            },
                        ),
                        # Rebind verified snapshots after source reordering; never replay IDs.
                        "source_refs": [
                            source_indices[(str(snapshot.upload_id), snapshot.sha256)]
                            for snapshot in change.source_snapshots
                            if (str(snapshot.upload_id), snapshot.sha256)
                            in source_indices
                        ],
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
