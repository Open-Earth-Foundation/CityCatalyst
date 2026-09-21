"""Request-local agent tools for reading, searching, and proposing draft edits."""

from typing import Any
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
            validate_structure(before.chapters, after)
            if before.chapters == after:
                raise EditOperationError(
                    "invalid_structure", "The proposal must change the structure."
                )
        except (EditOperationError, ValueError) as error:
            return {"ok": False, "message": str(error)}
        session.plan = EditPlanOutput(
            intent="edit", structure=StructureProposal(before=before, after=after)
        )
        return {"ok": True, "kind": "structure", "requires_confirmation": True}

    return [search_draft, read_chapter, propose_edits, propose_structure]
