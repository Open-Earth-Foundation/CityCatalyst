from __future__ import annotations

import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.request_context import get_request_id
from app.models.concept_note_runs import (
    ConceptNoteRunResponse,
    ConceptNoteStartRequest,
)
from app.models.db.concept_note import ConceptNoteRun
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.services.cnb.funding_references import (
    FundingReferenceValidator,
    PostgresFundingReferenceValidator,
)
from app.persistence.concept_notes.runs import ConceptNoteRunRepository


class ConceptNoteRunService:
    """Authorize, create, replay, and read Concept Note Builder runs."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        cc_client: CityCatalystClient | None = None,
        funding_reference_validator: FundingReferenceValidator | None = None,
    ) -> None:
        """Initialize the service with persistence and CityCatalyst clients."""
        self.repository = ConceptNoteRunRepository(session)
        self.cc_client = cc_client or CityCatalystClient()
        self.funding_reference_validator = (
            funding_reference_validator or PostgresFundingReferenceValidator()
        )

    async def start_run(
        self,
        payload: ConceptNoteStartRequest,
        *,
        authorization: str | None,
    ) -> ConceptNoteRunResponse:
        """Create or replay a run after validating user and city access."""
        token = _require_bearer_token(authorization)
        await self._authorize_scope(
            token=token,
            requested_user_id=payload.user_id,
            city_id=payload.city_id,
        )
        if payload.thread_id is not None and not (
            await self.repository.thread_belongs_to_user(
                thread_id=payload.thread_id,
                user_id=payload.user_id,
            )
        ):
            raise HTTPException(status_code=404, detail="Chat thread not found")
        await self.funding_reference_validator.validate(
            funder_id=payload.funder_id,
            selected_funding_opportunity_id=payload.selected_funding_opportunity_id,
        )

        fingerprint = _request_fingerprint(payload)
        run, created = await self.repository.create_or_get(
            user_id=payload.user_id,
            name=payload.name,
            city_id=str(payload.city_id),
            project_id=payload.project_id,
            funder_id=payload.funder_id,
            selected_funding_opportunity_id=payload.selected_funding_opportunity_id,
            thread_id=payload.thread_id,
            idempotency_key=payload.idempotency_key,
            request_fingerprint=fingerprint,
            trace_id=get_request_id() or None,
        )
        _require_matching_fingerprint(run, fingerprint)
        return _to_response(run, created=created)

    async def get_run(
        self,
        *,
        run_id: UUID,
        requested_user_id: str,
        authorization: str | None,
    ) -> ConceptNoteRunResponse:
        """Return an owned run after revalidating current city access."""
        token = _require_bearer_token(authorization)
        canonical_user_id = await self._canonical_user_id(token)
        if canonical_user_id != requested_user_id:
            raise HTTPException(
                status_code=403,
                detail="Request user does not match authenticated token",
            )

        run = await self.repository.get_for_user(
            run_id=run_id,
            user_id=canonical_user_id,
        )
        if run is None:
            raise HTTPException(status_code=404, detail="Concept Note run not found")

        await self._validate_city_access(
            token=token,
            user_id=canonical_user_id,
            city_id=UUID(run.city_id),
        )
        return _to_response(run, created=False)

    async def _authorize_scope(
        self,
        *,
        token: str,
        requested_user_id: str,
        city_id: UUID,
    ) -> None:
        """Validate token identity and CityCatalyst city access."""
        canonical_user_id = await self._canonical_user_id(token)
        if canonical_user_id != requested_user_id:
            raise HTTPException(
                status_code=403,
                detail="Request user does not match authenticated token",
            )
        await self._validate_city_access(
            token=token,
            user_id=canonical_user_id,
            city_id=city_id,
        )

    async def _canonical_user_id(self, token: str) -> str:
        """Resolve a bearer token to its canonical CityCatalyst user."""
        try:
            return await self.cc_client.validate_user_identity(token)
        except CityCatalystClientError as exc:
            raise _citycatalyst_http_exception(exc) from exc

    async def _validate_city_access(
        self,
        *,
        token: str,
        user_id: str,
        city_id: UUID,
    ) -> None:
        """Require current CityCatalyst access to the requested city."""
        try:
            await self.cc_client.get_city(
                city_id=str(city_id),
                token=token,
                user_id=user_id,
            )
        except CityCatalystClientError as exc:
            raise _citycatalyst_http_exception(exc) from exc


def _require_bearer_token(authorization: str | None) -> str:
    """Extract a non-empty bearer token from an Authorization header."""
    if authorization is None:
        raise HTTPException(
            status_code=401,
            detail="CityCatalyst access token is required",
        )
    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="Authorization header must use Bearer token",
        )
    return token.strip()


def _request_fingerprint(payload: ConceptNoteStartRequest) -> str:
    """Hash the immutable normalized creation payload for replay validation."""
    fingerprint_payload = payload.model_dump(
        mode="json",
        exclude={"idempotency_key"},
    )
    encoded = json.dumps(
        fingerprint_payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _require_matching_fingerprint(
    run: ConceptNoteRun,
    request_fingerprint: str,
) -> None:
    """Reject reuse of an idempotency key for different creation data."""
    if run.request_fingerprint != request_fingerprint:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "idempotency_key_reused",
                "message": "Idempotency key was already used for another request",
            },
        )


def _citycatalyst_http_exception(
    exc: CityCatalystClientError,
) -> HTTPException:
    """Map CityCatalyst integration failures to stable public HTTP statuses."""
    if exc.status_code in {401, 403, 404}:
        return HTTPException(
            status_code=exc.status_code,
            detail="CityCatalyst authorization failed",
        )
    return HTTPException(
        status_code=503,
        detail="CityCatalyst authorization is unavailable",
    )


def _to_response(
    run: ConceptNoteRun,
    *,
    created: bool,
) -> ConceptNoteRunResponse:
    """Serialize one persisted run into the public API contract."""
    return ConceptNoteRunResponse(
        run_id=run.run_id,
        thread_id=run.thread_id,
        user_id=run.user_id,
        name=run.name,
        city_id=run.city_id,
        project_id=run.project_id,
        funder_id=run.funder_id,
        selected_funding_opportunity_id=run.selected_funding_opportunity_id,
        status="active",
        workflow_step="assembling_context",
        created=created,
        trace_id=run.trace_id,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )
