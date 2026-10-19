"""Message creation and streaming endpoints."""

from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.session import get_session_factory, get_session_optional
from app.models.requests import MessageCreateRequest
from app.services.cnb.chat_readiness import require_chat_context_ready
from app.services.cnb.chat_retry import is_retry_turn
from app.services.cnb.draft_overview import (
    DRAFT_OVERVIEW_REQUEST,
    claim_draft_overview,
    is_draft_overview_turn,
    release_draft_overview,
)
from app.services.message_service import MessageService
from app.services.thread_service import ThreadService
from app.utils.agent_tracing import configure_agents_tracing
from app.utils.chat_workflow_context import STATIONARY_ENERGY_DRAFT_RUN_ID_KEY
from app.utils.citycatalyst_auth import (
    authenticate_write_request,
    normalize_write_context,
)
from app.utils.request_token_refresh import RequestTokenRefreshContext
from app.utils.sse_heartbeat import with_sse_heartbeats
from app.utils.stationary_energy_context import (
    extract_stationary_energy_draft_run_id,
    is_stationary_energy_resume_turn,
)
from app.utils.streaming_handler import StreamingHandler
from app.utils.thread_resolver import ThreadResolver

logger = logging.getLogger(__name__)

router = APIRouter()

# Configure LangSmith tracing for Agents SDK
settings = get_settings()
configure_agents_tracing(settings)


@router.options("/messages", include_in_schema=False)
async def options_messages() -> Response:
    return Response(status_code=200)


@router.post("/messages")
async def post_message(
    payload: MessageCreateRequest,
    authorization: Annotated[str | None, Header()] = None,
    session: Optional[AsyncSession] = Depends(get_session_optional),
    session_factory: Optional[async_sessionmaker[AsyncSession]] = Depends(get_session_factory),
) -> StreamingResponse:
    """Create a message and stream AI response.

    This endpoint handles:
    - Request-bearer authentication against Core before any write
    - Thread resolution/creation for the canonical subject
    - CNB readiness validation (409 concept_note_context_not_ready before saving a turn)
    - Hidden drafting-overview claim (after auth, once per drafting build)
    - User message persistence (a `concept_note_turn: retry` turn skips it when
      the thread's latest message is already this question)
    - AI response streaming via SSE

    Args:
        payload: Message creation request (user_id, content, optional thread_id, inventory_id)
        authorization: Bearer token validated through Core before persistence
        session: Database session (optional, for graceful degradation)
        session_factory: Session factory for async operations

    Returns:
        StreamingResponse with Server-Sent Events (SSE)
    """
    # Authenticate before thread lookup, implicit creation, or tool registration.
    identity = await authenticate_write_request(
        authorization=authorization,
        claimed_user_id=payload.user_id,
    )
    token_refresh_context = RequestTokenRefreshContext(
        canonical_user_id=identity.user_id,
        token=identity.token,
    )
    normalized_context = normalize_write_context(payload.context, identity.token)
    authenticated_payload = payload.model_copy(
        update={
            "user_id": identity.user_id,
            "context": normalized_context,
        }
    )
    logger.info(
        "POST /messages - user_id=%s, thread_id=%s, content_length=%d, inventory_id=%s, has_context=%s",
        identity.user_id,
        authenticated_payload.thread_id,
        len(authenticated_payload.content),
        authenticated_payload.inventory_id,
        bool(normalized_context),
    )

    # Base warnings for database unavailability
    history_warning: Optional[str] = None
    if session is None and session_factory is None:
        history_warning = (
            "Chat history is temporarily unavailable. The conversation will continue, "
            "but your messages will not be saved."
        )

    try:
        # 1. Resolve or create thread for the canonical subject only.
        resolved_thread_id = await ThreadResolver.resolve_thread(
            thread_id=authenticated_payload.thread_id,
            payload=authenticated_payload,
            user_id=identity.user_id,
            session_factory=session_factory,
        )

        logger.info("Thread resolved: thread_id=%s", resolved_thread_id)

        # Reject unready CNB turns before saving a message or starting SSE.
        await require_chat_context_ready(
            session_factory=session_factory,
            thread_id=resolved_thread_id,
            user_id=identity.user_id,
            context=normalized_context,
            options=authenticated_payload.options,
        )

        # The hidden drafting-overview turn uses server-owned trigger text. It
        # is claimed after authentication so a rejected request cannot use up
        # the build's single overview.
        overview_turn = is_draft_overview_turn(authenticated_payload.options)
        if overview_turn:
            authenticated_payload = authenticated_payload.model_copy(
                update={"content": DRAFT_OVERVIEW_REQUEST}
            )

        # 2. Persist user message and the validated request bearer.
        if session_factory:
            try:
                async with session_factory() as db_session:
                    thread_service = ThreadService(db_session)
                    thread = await thread_service.get_thread(resolved_thread_id)

                    if thread:
                        # Replace credentials so a stored cc_access_token cannot
                        # survive the shallow merge in update_context.
                        thread.context = normalize_write_context(
                            thread.context,
                            identity.token,
                        )
                        await db_session.flush()
                        logger.info("Persisted validated CC token to thread context")

                        stationary_energy_draft_run_id = extract_stationary_energy_draft_run_id(
                            normalized_context,
                            authenticated_payload.options,
                        )
                        if stationary_energy_draft_run_id:
                            await thread_service.set_workflow_context(
                                thread,
                                workflow_key=STATIONARY_ENERGY_DRAFT_RUN_ID_KEY,
                                run_id=stationary_energy_draft_run_id,
                            )
                            logger.info(
                                "Persisted Stationary Energy draft context on thread_id=%s",
                                resolved_thread_id,
                            )

                        # The overview trigger is not a user message, and a
                        # Stationary Energy resume turn repeats a message that
                        # is already stored; keep both out of the history.
                        if not overview_turn and not is_stationary_energy_resume_turn(
                            authenticated_payload.options
                        ):
                            message_service = MessageService(db_session)
                            # A retry after a failed reply repeats a question
                            # that was saved before streaming began.
                            already_saved = is_retry_turn(
                                authenticated_payload.options
                            ) and await message_service.latest_message_is_user_text(
                                thread_id=resolved_thread_id,
                                text=authenticated_payload.content,
                            )
                            if not already_saved:
                                await message_service.create_user_message(
                                    thread_id=resolved_thread_id,
                                    user_id=identity.user_id,
                                    text=authenticated_payload.content,
                                )
                        await thread_service.touch_thread(thread)
                        await db_session.commit()

                    logger.info("User message persisted to thread_id=%s", resolved_thread_id)
            except Exception as e:
                logger.warning("Failed to persist user message: %s", e)
                history_warning = (
                    "Chat history is temporarily unavailable. The conversation will continue, "
                    "but your messages will not be saved."
                )

        # 3. Claim the overview once per drafting build, right before streaming.
        draft_overview_claim = None
        if overview_turn:
            draft_overview_claim = await claim_draft_overview(
                session_factory=session_factory,
                thread_id=resolved_thread_id,
                user_id=identity.user_id,
            )

        # 4. Stream with the canonical subject and validated request bearer.
        # Once the handler exists its own cleanup releases the claim; before
        # that, release here.
        try:
            handler = StreamingHandler(
                thread_id=resolved_thread_id,
                user_id=identity.user_id,
                session_factory=session_factory,
                cc_access_token=identity.token,
                request_token_refresh_context=token_refresh_context,
                catalog_user_id=identity.user_id,
                inventory_id=authenticated_payload.inventory_id,
                request_context=normalized_context,
                request_options=authenticated_payload.options,
                draft_overview_claim=draft_overview_claim,
            )
        except BaseException:
            if draft_overview_claim is not None:
                run_id, build_id = draft_overview_claim
                await release_draft_overview(
                    session_factory=session_factory,
                    run_id=run_id,
                    user_id=identity.user_id,
                    build_id=build_id,
                )
            raise

        headers = {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }

        return StreamingResponse(
            with_sse_heartbeats(
                handler.stream_response(authenticated_payload, history_warning)
            ),
            media_type="text/event-stream",
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unhandled exception in post_message")
        raise HTTPException(
            status_code=500,
            detail={"message": "An internal error occurred", "error": str(e)},
        )
