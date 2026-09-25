"""On-demand, read-only lookup of a CNB run's missing-information gaps."""

import json
import logging
from uuid import UUID

from agents import FunctionTool, function_tool
from app.persistence.concept_notes.context_bundle import load_agent_context
from app.services.cnb.ui_context import GapSeverity, load_gap_list
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
        chapter_position: int | None = None,
        severity: GapSeverity | None = None,
        include_closed: bool = False,
    ) -> str:
        """List the concept note's missing-information gaps with their questions.

        Call when the user asks which information is missing, which gaps remain
        or are addressed, what a chapter still needs, or whether a file or
        answer could fill a gap. Each gap has a stable handle such as "G3", its
        chapter, the question, why it is asked, severity, and state. Omit
        arguments to list every open gap; pass chapter_position to narrow to one
        chapter, severity to narrow to "critical" or "noncritical", and
        include_closed=true to also see resolved, dismissed, or caveat gaps.
        Read-only: it cannot resolve or change a gap.
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
                chapter_position=chapter_position,
                severity=severity,
                include_closed=include_closed,
            )
            logger.info(
                "Listed CNB gaps run_id=%s chapter_position=%s severity=%s "
                "include_closed=%s returned=%s",
                run_uuid,
                chapter_position,
                severity,
                include_closed,
                len(result["gaps"]),
            )
            return json.dumps({"success": True, **result}, ensure_ascii=False)
        except Exception:
            logger.warning("CNB gap lookup failed run_id=%s", run_uuid, exc_info=True)
            return json.dumps({"success": False, "error": "CNB gaps unavailable"})

    return [concept_note_gaps]
