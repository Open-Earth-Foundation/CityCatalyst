"""Request-local agent tools for reading, searching, and proposing draft edits."""

from typing import Any

from agents import FunctionTool, function_tool

from app.models.cnb.concept_note_edits import DraftReplacement
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

    return [search_draft, read_chapter, propose_edits]
