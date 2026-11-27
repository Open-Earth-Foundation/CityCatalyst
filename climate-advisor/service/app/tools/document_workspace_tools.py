"""Read and guide authorized document points through shared Clima services.

The model can inspect work and open its question. Acceptance remains an explicit
user action in the shared point card; these tools never mutate facts or prose.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal
from uuid import UUID, uuid4

from agents import FunctionTool, function_tool
from app.models.document_workspace.contracts import (
    DocumentPointCommand,
    DocumentWorkspacePoint,
)
from app.services.citycatalyst_client import CityCatalystClient
from app.services.concept_note_runs import ConceptNoteRunService
from app.services.document_workspace.service import get_document_workspace_service
from app.utils.request_token_refresh import RequestTokenRefreshContext
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


def build_document_workspace_tools(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: str | UUID,
    user_id: str,
    token_ref: dict[str, str | None],
    ui_locale: str = "en",
    request_token_refresh_context: RequestTokenRefreshContext | None = None,
) -> list[FunctionTool]:
    """Bind document authorization outside the model and recheck every read."""
    run_uuid = UUID(str(run_id))

    async def read(point_key: str | None = None, proposal: dict | None = None) -> str:
        """Load authorized shared state without exposing backend identifiers."""
        token = token_ref.get("value")
        if not token:
            return _result(False, error_code="missing_token")
        try:
            service = get_document_workspace_service()
            if service is None:
                return _result(False, error_code="document_workspace_unavailable")
            async with session_factory() as session:
                client = CityCatalystClient(
                    request_token_refresh_context=request_token_refresh_context
                )
                run_service = ConceptNoteRunService(session, cc_client=client)
                try:
                    if request_token_refresh_context is not None:
                        token = await request_token_refresh_context.token_for_request(
                            client.refresh_token
                        )
                    run = await run_service.get_authorized_run(
                        run_id=run_uuid,
                        requested_user_id=user_id,
                        authorization=f"Bearer {token}",
                    )
                    await session.close()
                    workspace = await service.load(run)
                    if point_key is not None:
                        point = next(
                            (p for p in workspace.points if p.key == point_key), None
                        )
                        if point is None:
                            return _result(False, error_code="point_not_found")
                        if proposal is not None:
                            return _prepare_action(point, proposal)
                        question = await service.question(
                            run, point_key, language=ui_locale
                        )
                        return _result(
                            True,
                            action="document_workspace.open_point",
                            data={
                                "point_key": point_key,
                                "question": question.model_dump(mode="json"),
                            },
                        )
                    return _result(
                        True,
                        data={
                            "setup": workspace.setup.name if workspace.setup else None,
                            "points": [
                                _point_context(point) for point in workspace.points
                            ],
                            "needs": [
                                {
                                    "label": need.label,
                                    "description": need.description,
                                    "status": need.status,
                                    "point_keys": need.point_keys,
                                    "guidance": need.guidance,
                                    "holder": need.holder,
                                }
                                for need in workspace.needs
                            ],
                            "coverage": {
                                "required_total": workspace.overview.required_total,
                                "required_covered": workspace.overview.required_covered,
                                "optional_total": workspace.overview.optional_total,
                                "optional_covered": workspace.overview.optional_covered,
                                "waiting_count": workspace.overview.waiting_count,
                            },
                            "final_export_ready": workspace.export_eligibility.final,
                            "export_blockers": workspace.export_eligibility.blockers,
                        },
                    )
                finally:
                    await client.close()
        except HTTPException as exc:
            logger.info(
                "Document workspace tool denied run_id=%s status=%s",
                run_uuid,
                exc.status_code,
            )
            return _result(False, error_code="document_workspace_access_denied")
        except Exception:
            logger.exception("Document workspace tool failed run_id=%s", run_uuid)
            return _result(False, error_code="document_workspace_read_failed")

    @function_tool
    async def document_workspace_points() -> str:
        """Read current facts, decisions, evidence needs and waiting work.

        Use before drafting or afterwards to identify what is known and what is
        missing. Accepted values and source candidates are distinct. This tool
        cannot accept answers, choose conflicting sources or alter the draft.
        """
        return await read()

    @function_tool
    async def document_workspace_question(point_key: str) -> str:
        """Open guidance for one exact semantic key returned by points lookup.

        This returns the shared question and opens its point card. The user
        answers or confirms there; do not treat showing a question as acceptance.
        It does not create an assumption, assign a colleague or send a request.
        """
        return await read(point_key)

    @function_tool
    async def document_workspace_prepare(
        point_key: str,
        action: Literal[
            "answer",
            "correct",
            "assume",
            "not_applicable",
            "confirm_candidate",
            "dismiss_candidate",
            "park",
            "resume",
        ],
        value: str | float | None = None,
        reason: str | None = None,
        candidate: str | None = None,
        waiting_for: str | None = None,
        requested_information: str | None = None,
    ) -> str:
        """Prepare the user's stated decision for review. Only their Save click applies it.

        Use the exact point key and C-number from the current lookup. Use a JSON
        number for numeric fields. For waiting, include the recipient and note.
        """
        return await read(
            point_key,
            {
                "command": action,
                "value": value,
                "reason": reason,
                "candidate": candidate,
                "waiting_for": waiting_for,
                "requested_information": requested_information,
            },
        )

    return [
        document_workspace_points,
        document_workspace_question,
        document_workspace_prepare,
    ]


def _prepare_action(point: DocumentWorkspacePoint, proposal: dict) -> str:
    """Bind a suggestion to the visible point revision without mutating it."""
    command = proposal["command"]
    params = {
        key: value
        for key, value in proposal.items()
        if value is not None and key != "candidate"
    }
    preview = None
    source = []
    if command in {"confirm_candidate", "dismiss_candidate"}:
        choices = {f"C{i}": item for i, item in enumerate(point.candidates, 1)}
        item = choices.get(proposal.get("candidate"))
        if not item or item.status != "pending":
            return _result(False, error_code="candidate_not_pending")
        params["candidate_id"] = item.candidate_id
        preview = item.value
        source = [citation.model_dump(mode="json") for citation in item.citations]
    if command in {"answer", "correct", "assume"}:
        value = proposal.get("value")
        if value is None or (isinstance(value, str) and not value.strip()):
            return _result(False, error_code="missing_answer")
        if (point.answer_type == "number") != isinstance(value, (float, int)):
            return _result(False, error_code="invalid_answer_type")
    if (
        command in {"assume", "not_applicable"}
        and not (proposal.get("reason") or "").strip()
    ):
        return _result(False, error_code="reason_required")
    if command == "park" and not (proposal.get("requested_information") or "").strip():
        return _result(False, error_code="request_note_required")
    payload = DocumentPointCommand(
        **params, expected_version=point.version, idempotency_key=str(uuid4())
    )
    return _result(
        True,
        action="document_workspace.prepare",
        data={
            "point_key": point.key,
            "label": point.label,
            "command": payload.model_dump(exclude_none=True),
            "candidate_value": preview,
            "citations": source,
        },
    )


def _point_context(point: DocumentWorkspacePoint) -> dict[str, Any]:
    """Project the validated public point model into model-safe references."""
    return {
        "key": point.key,
        "label": point.label,
        "description": point.description,
        "kind": point.kind,
        "answer_type": point.answer_type,
        "work_group": point.work_group,
        "required": point.required,
        "status": point.status,
        "value": point.value,
        "accepted_reason": point.accepted_reason,
        "freshness": point.freshness,
        "candidates": [
            {
                "candidate": f"C{index}",
                "value": candidate.value,
                "status": candidate.status,
                "citations": [
                    citation.model_dump(mode="json") for citation in candidate.citations
                ],
            }
            for index, candidate in enumerate(point.candidates, start=1)
        ],
        "task": point.task.model_dump(mode="json") if point.task else None,
    }


def _result(
    success: bool,
    *,
    data: dict[str, Any] | None = None,
    error_code: str | None = None,
    action: str = "document_workspace.points",
) -> str:
    """Serialize a stable tool result; no raw exception or credential output."""
    return json.dumps(
        {"action": action, "success": success, "data": data, "error_code": error_code},
        ensure_ascii=False,
    )
