"""On-demand, read-only lookup of a CNB run's missing-information gaps."""

import json
import logging
from uuid import UUID

from agents import FunctionTool, function_tool
from app.persistence.concept_notes.context_bundle import load_agent_context
from app.services.cnb.ui_context import (
    GapSeverity,
    UnknownChapterNumberError,
    load_gap_list,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


def build_concept_note_gap_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: str | UUID,
    user_id: str,
) -> list[FunctionTool]:
    """Bind gap lookup to one CNB run and recheck access on every invocation."""
    run_uuid = UUID(str(run_id))

    @function_tool
    async def concept_note_gaps(
        chapter_number: int | None = None,
        severity: GapSeverity | None = None,
        include_closed: bool = False,
    ) -> str:
        """List the concept note's missing-information gaps with their questions.

        Call when the user asks which information is missing, which gaps remain
        or are addressed, what a chapter still needs, or whether a file or
        answer could fill a gap. Each gap has chapter_number and gap_number,
        the numbers the draft shows (chapter "6 · Indicative financing", marker
        "Gap 2"), its chapter title, question, why it is asked, severity, label
        (the UI word: "Required" for critical, "Optional" for noncritical), and
        state. gap_number counts within the chapter, is null for closed gaps,
        and can skip a number the draft gives a marker without a gap record.
        Omit arguments to list every open gap. Pass chapter_number only when
        the user names a chapter by its number ("chapter 6" is 6); for a
        chapter title or topic, or when unsure, omit it and use the full list.
        An unknown chapter_number returns success=false with the valid chapter
        numbers and titles. Pass severity "critical" or "noncritical" to narrow
        by severity, and include_closed=true to also see resolved, dismissed, or
        caveat gaps. A resolved gap filled from an uploaded file lists that
        file's source label in filled_from. An open gap may list suggestions:
        unverified values found in uploaded sources, each with its source_refs
        labels. An open gap may list answered_so_far: answers the user saved in
        its form that are not in the draft yet; the chapter is updated once
        every part is answered. Read-only: it cannot resolve or change a gap.
        """
        # Reauthorize before reading the separately stored workspace.
        try:
            context = await load_agent_context(
                session_factory=session_factory, user_id=user_id, run_id=run_uuid
            )
            if context is None:
                return json.dumps(
                    {"success": False, "error": "CNB context unavailable"}
                )

            result = await load_gap_list(
                run_uuid,
                chapter_number=chapter_number,
                severity=severity,
                include_closed=include_closed,
            )
            logger.info(
                "Listed CNB gaps run_id=%s chapter_number=%s severity=%s "
                "include_closed=%s returned=%s",
                run_uuid,
                chapter_number,
                severity,
                include_closed,
                len(result["gaps"]),
            )
            return json.dumps({"success": True, **result}, ensure_ascii=False)
        except UnknownChapterNumberError as error:
            # Name the valid chapters so the agent can retry instead of reporting none.
            logger.info(
                "Unknown CNB chapter number run_id=%s chapter_number=%s",
                run_uuid,
                chapter_number,
            )
            return json.dumps(
                {"success": False, "error": str(error)}, ensure_ascii=False
            )
        except Exception:
            logger.warning("CNB gap lookup failed run_id=%s", run_uuid, exc_info=True)
            return json.dumps({"success": False, "error": "CNB gaps unavailable"})

    return [concept_note_gaps]
