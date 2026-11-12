"""Request-local agent tools for reading, searching, and proposing draft edits."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Literal
from uuid import uuid4

from agents import FunctionTool, function_tool
from app.models.cnb.concept_note_edits import DraftReplacement, EditPlanOutput
from app.models.cnb.concept_note_structure import (
    StructureChapter,
    StructurePlannedChapter,
    StructureProposal,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.structure import (
    structure_snapshot,
    validate_structure,
)
from app.services.cnb.edit_session import DraftEditSession
from app.utils.cnb_progress import emit_cnb_progress

logger = logging.getLogger(__name__)

# Answers one question about one selected source with a serialized capability envelope.
SourceLookup = Callable[[int, str], Awaitable[str]]
# One lookup task per (source_index, normalized question) for a whole edit operation.
SourceLookupCache = dict[tuple[int, str], "asyncio.Future[str]"]


def build_draft_tools(
    session: DraftEditSession, chapter_inputs: dict[int, dict[str, Any]]
) -> list[FunctionTool]:
    """Bind tool access to one authorized proposal snapshot without write tools."""

    @function_tool
    async def search_draft(
        text: str, chapter_positions: list[int] | None = None
    ) -> dict[str, Any]:
        """Search literal draft text. Omit chapter_positions to search the entire document."""
        await emit_cnb_progress("planning")
        return session.search_draft(text, chapter_positions)

    @function_tool
    async def read_chapter(chapter_position: int) -> dict[str, Any]:
        """Read a current chapter, its revision, gaps, and prior proposed changes."""
        payload = chapter_inputs.get(chapter_position)
        if payload is None:
            return {
                "ok": False,
                "code": "invalid_target",
                "message": "Use a chapter position from the catalogue.",
            }
        await emit_cnb_progress("planning", chapter_title=payload["chapter"]["title"])
        return {
            "ok": True,
            "chapter": payload["chapter"],
            "prior_proposal": payload["prior_proposal"],
        }

    @function_tool
    async def propose_edits(replacements: list[DraftReplacement]) -> dict[str, Any]:
        """Validate the complete replacement list without writing; repair any returned errors."""
        await emit_cnb_progress("validating")
        return session.propose_edits(replacements)

    @function_tool
    async def propose_structure(
        chapters: list[StructurePlannedChapter],
    ) -> dict[str, Any]:
        """Preview complete chapter order/titles/descriptions; null positions insert custom chapters."""
        # Resolve positions against the immutable server snapshot.
        session.plan = None
        before = structure_snapshot(list(session.chapters.values()))
        after = []
        try:
            for item in chapters:
                source = session.chapters.get(item.chapter_position)
                if item.chapter_position is not None and source is None:
                    raise EditOperationError(
                        "invalid_target",
                        "Use an existing catalogue position or null for a custom chapter.",
                    )
                after.append(
                    StructureChapter(
                        chapter_id=source.chapter_id if source else uuid4(),
                        template_section_id=source.chapter_ref if source else None,
                        required=source.required if source else False,
                        title=item.title,
                        description=item.description,
                    )
                )
            # Reject protected membership changes before staging a preview.
            validate_structure(before.chapters, after)
            if before.chapters == after:
                raise EditOperationError(
                    "invalid_structure", "The proposal must change the structure."
                )
        except (EditOperationError, ValueError) as error:
            return {"ok": False, "message": str(error)}
        # Stage only; acceptance is a separate authorized operation.
        session.plan = EditPlanOutput(
            intent="edit", structure=StructureProposal(before=before, after=after)
        )
        return {"ok": True, "kind": "structure", "requires_confirmation": True}

    return [search_draft, read_chapter, propose_edits, propose_structure]


def build_source_query_tool(
    lookup: SourceLookup,
    *,
    stage: Literal["planning", "reviewing"],
    max_queries: int,
    max_answer_chars: int,
    cache: SourceLookupCache,
) -> FunctionTool:
    """Bound one agent's selected-source lookups; failures are returned, never raised.

    ``cache`` holds one task per question for the whole edit operation, shared by
    the planner and every reviewer: concurrent askers await the same document
    read, and a repeated question costs nothing and does not count against the
    limit. A failed answer is dropped from the cache so it stays retryable.
    Each answer keeps whole quotations up to ``max_answer_chars``, so lookups add
    at most ``max_queries * max_answer_chars`` characters to one agent's context.
    """
    used = 0

    async def read(source_index: int, question: str, key: tuple[int, str]) -> str:
        """Run one lookup, bound its answer, and keep it cached only on success."""
        result = bound_source_answer(await lookup(source_index, question), max_answer_chars)
        succeeded = json.loads(result).get("success") is True
        if not succeeded:
            cache.pop(key, None)
        # Log outcomes only; questions and answers may contain document text.
        logger.info(
            "Concept Note edit source lookup stage=%s source_index=%s success=%s",
            stage,
            source_index,
            succeeded,
        )
        return result

    @function_tool
    async def query_source(source_index: int, question: str) -> str:
        """Find exact quotations answering one focused question in one selected source.

        Args:
            source_index: One-based source_index from run_context.selected_sources.
            question: One bounded question, for example a single figure or status.

        The source is re-read in full and every quotation is verified against it.
        A failed call, or found=false, is not evidence. When caveats say
        quotations were left out, ask a narrower question.
        """
        nonlocal used
        key = (source_index, " ".join(question.split()).lower())
        task = cache.get(key)
        if task is None:
            if used >= max_queries:
                return json.dumps(
                    {
                        "success": False,
                        "error_code": "source_query_limit",
                        "error": "No source lookups remain for this step.",
                    }
                )
            used += 1
            task = asyncio.ensure_future(read(source_index, question, key))
            cache[key] = task
        return await task

    return query_source


def bound_source_answer(result: str, max_chars: int) -> str:
    """Keep whole quotations up to ``max_chars``; say how many were left out."""
    payload = json.loads(result)
    data = payload.get("data")
    if payload.get("success") is not True or not isinstance(data, dict):
        return result
    kept, size = [], 0
    for excerpt in data.get("excerpts") or []:
        size += len(excerpt.get("text", ""))
        if size > max_chars:
            break
        kept.append(excerpt)
    omitted = len(data.get("excerpts") or []) - len(kept)
    if not omitted:
        return result
    data["excerpts"] = kept
    data["caveats"] = [
        *(data.get("caveats") or []),
        f"{omitted} more quotations were left out to fit the edit context; "
        "ask a narrower question to see them.",
    ]
    return json.dumps(payload, ensure_ascii=False)
