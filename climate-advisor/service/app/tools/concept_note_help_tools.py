"""On-demand, read-only capability and navigation help for the CNB agent."""

import json
import logging
from uuid import UUID

from agents import FunctionTool, function_tool
from app.persistence.concept_notes.context_bundle import load_agent_context
from app.services.cnb.ui_context import load_ui_state
from app.tools.concept_note_ui_labels import render_concept_note_ui_guide
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


def build_concept_note_help_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: str | UUID,
    user_id: str,
    ui_locale: str | None = None,
) -> list[FunctionTool]:
    """Bind UI help to one CNB run and recheck access on every invocation.

    `ui_locale` is the user's active frontend language; the guide quotes control
    labels in that language and falls back to English when it is unsupported.
    """
    run_uuid = UUID(str(run_id))

    @function_tool
    async def concept_note_help() -> str:
        """Explain what CNB/Clima can do and where or how to use its interface.

        Call when the user asks about capabilities, finding the draft, changing
        funding, uploading files, how to edit/save, or downloading/export blockers.
        Returns the UI guide and fresh draft/export state; does not change anything.
        Do not call for project facts, source research, or actual edit requests.
        No arguments: the service binds the authorized project and user.
        """
        # Reauthorize before accessing the separately stored workspace.
        try:
            context = await load_agent_context(
                session_factory=session_factory, user_id=user_id, run_id=run_uuid
            )
            if context is None:
                return json.dumps(
                    {"success": False, "error": "CNB context unavailable"}
                )

            # Read state only when help is requested; never guess browser-only facts.
            state = await load_ui_state(run_uuid)
            guide, locale = render_concept_note_ui_guide(ui_locale)
            logger.info("Loaded CNB help run_id=%s ui_locale=%s", run_uuid, locale)
            return json.dumps(
                {
                    "success": True,
                    "ui_locale": locale,
                    "guide": guide,
                    "ui_state": state,
                },
                ensure_ascii=False,
            )
        except Exception:
            logger.warning("CNB help unavailable run_id=%s", run_uuid, exc_info=True)
            return json.dumps({"success": False, "error": "CNB help unavailable"})

    return [concept_note_help]
