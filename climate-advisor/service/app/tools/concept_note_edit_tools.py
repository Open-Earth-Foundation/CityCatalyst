"""One run-bound conversational capability: propose, never apply, undo or restore."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from agents import function_tool
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.cnb.concept_note_edits import EditProposalRequest
from app.services.cnb.edits import get_edit_service, load_edit_context
from app.services.concept_note_runs import ConceptNoteRunService

logger = logging.getLogger(__name__)
CONCEPT_NOTE_EDIT_PROPOSE_CAPABILITY = "concept_note.edit.propose"


def build_concept_note_edit_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: str | UUID,
    user_id: str,
    token_ref: dict[str, str | None],
    request: EditProposalRequest,
    recent_messages: list[dict[str, str]] | None = None,
) -> list:
    """Bind the user's exact instruction and UI selection outside model arguments."""
    run_uuid = UUID(str(run_id))

    @function_tool
    async def concept_note_edit_propose() -> str:
        """Propose precise revisions for the CURRENT user's explicit edit request.

        Use only when the user asks to change the existing Concept Note, not for
        questions, explanations or source queries. The exact current instruction,
        automatic scope, optional focused-chapter hint, and idempotency key are
        already bound by the UI.
        When status is "proposed", tell the user to review the inline document
        changes. When status is "clarification_required", ask the returned
        clarification directly in chat. Never refer to a proposal or clarification
        card.
        This tool NEVER applies, undoes or restores text, even if asked to do so.
        Do not promise that the draft changed. Do not fabricate proposal IDs.
        """
        token = token_ref.get("value")
        if not token:
            return tool_result(False, code="missing_token")
        service = get_edit_service()
        if service is None:
            return tool_result(False, code="edit_unavailable")
        try:
            # Recheck token identity, run ownership and current city access at use time.
            async with session_factory() as session:
                run_service = ConceptNoteRunService(session)
                try:
                    run = await run_service.get_authorized_run(
                        run_id=run_uuid,
                        requested_user_id=user_id,
                        authorization=f"Bearer {token}",
                    )
                    context = await load_edit_context(session, run_uuid)
                    proposal = await service.propose(
                        run,
                        request,
                        context,
                        recent_messages=recent_messages,
                    )
                finally:
                    await run_service.cc_client.close()
            success = proposal.status in {
                "processing",
                "proposed",
                "clarification_required",
            }
            data = {
                "proposal_id": str(proposal.proposal_id),
                "run_id": str(run_uuid),
                "status": proposal.status,
            }
            if proposal.status == "clarification_required" and proposal.clarification:
                data["clarification"] = proposal.clarification
            return tool_result(
                success,
                data=data,
                code=None if success else proposal.error_code or "not_edit_request",
            )
        except HTTPException as error:
            return tool_result(
                False,
                code=(
                    "expired_token"
                    if error.status_code == 401
                    else "edit_forbidden"
                    if error.status_code in {403, 404}
                    else "edit_unavailable"
                ),
            )
        except Exception:
            logger.warning("Edit tool failed run_id=%s code=edit_unavailable", run_uuid)
            return tool_result(False, code="edit_unavailable")

    return [concept_note_edit_propose]


def tool_result(
    success: bool, *, data: dict[str, str] | None = None, code: str | None = None
) -> str:
    """Serialize only typed proposal correlation metadata for chat transport."""
    return json.dumps(
        {
            "action": CONCEPT_NOTE_EDIT_PROPOSE_CAPABILITY,
            "success": success,
            "data": data,
            "error_code": code,
        }
    )
