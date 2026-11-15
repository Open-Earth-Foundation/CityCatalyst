"""Read and guide authorized document points through shared Clima services.

The model can inspect work and open its question. Acceptance remains an explicit
user action in the shared point card; these tools never mutate facts or prose.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from agents import FunctionTool, function_tool
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.document_workspace.contracts import DocumentWorkspacePoint
from app.services.citycatalyst_client import CityCatalystClient
from app.services.concept_note_runs import ConceptNoteRunService
from app.services.document_workspace.service import get_document_workspace_service
from app.utils.request_token_refresh import RequestTokenRefreshContext

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

    async def read(point_key: str | None = None) -> str:
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
                        if not any(
                            point.key == point_key for point in workspace.points
                        ):
                            return _result(False, error_code="point_not_found")
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

    return [document_workspace_points, document_workspace_question]


def _point_context(point: DocumentWorkspacePoint) -> dict[str, Any]:
    """Project the validated public point model into model-safe references."""
    return {
        "key": point.key,
        "label": point.label,
        "description": point.description,
        "kind": point.kind,
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
