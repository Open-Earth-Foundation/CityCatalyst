from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.concept_note_runs import ConceptNoteStartRequest
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.thread import Thread
from app.persistence.concept_notes.runs import ConceptNoteRunRepository
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.services.cnb.funding_references import FundingReferenceValidator
from app.services.concept_note_runs import (
    ConceptNoteRunService,
    _request_fingerprint,
)


def _start_request(*, user_id: str = "owner-1") -> ConceptNoteStartRequest:
    """Build a valid run-start request for service tests."""
    return ConceptNoteStartRequest(
        user_id=user_id,
        name="Resilient neighborhoods",
        city_id=uuid4(),
        idempotency_key=uuid4(),
    )


def _persisted_run(
    payload: ConceptNoteStartRequest,
    *,
    request_fingerprint: str,
) -> ConceptNoteRun:
    """Build the persisted run shape returned by the repository."""
    now = datetime.now(timezone.utc)
    return ConceptNoteRun(
        run_id=uuid4(),
        thread_id=payload.thread_id,
        user_id=payload.user_id,
        name=payload.name,
        city_id=str(payload.city_id),
        project_id=payload.project_id,
        funder_id=payload.funder_id,
        selected_funding_opportunity_id=payload.selected_funding_opportunity_id,
        status="active",
        workflow_step="assembling_context",
        context_summary={},
        permission_summary={},
        trace_id=None,
        idempotency_key=payload.idempotency_key,
        request_fingerprint=request_fingerprint,
        created_at=now,
        updated_at=now,
    )


def _run_service(
    *,
    canonical_user_id: str = "owner-1",
) -> tuple[ConceptNoteRunService, AsyncMock, AsyncMock, AsyncMock]:
    """Create a run service with isolated repository and integration mocks."""
    session = AsyncMock(spec=AsyncSession)
    cc_client = AsyncMock(spec=CityCatalystClient)
    cc_client.validate_user_identity.return_value = canonical_user_id
    cc_client.get_city.return_value = {}
    funding_validator = AsyncMock(spec=FundingReferenceValidator)
    repository = AsyncMock(spec=ConceptNoteRunRepository)

    service = ConceptNoteRunService(
        session,
        cc_client=cc_client,
        funding_reference_validator=funding_validator,
    )
    service.repository = repository
    return service, repository, cc_client, funding_validator


async def test_start_run_creates_after_scope_and_reference_validation() -> None:
    """Create a run only after validating identity, city, and funding scope."""
    payload = _start_request()
    service, repository, cc_client, funding_validator = _run_service()
    repository.create_or_get.return_value = (
        _persisted_run(
            payload,
            request_fingerprint=_request_fingerprint(payload),
        ),
        True,
    )

    response = await service.start_run(payload, authorization="Bearer token")

    assert response.created is True
    assert response.user_id == payload.user_id
    cc_client.validate_user_identity.assert_awaited_once_with("token")
    cc_client.get_city.assert_awaited_once_with(
        city_id=str(payload.city_id),
        token="token",
        user_id=payload.user_id,
    )
    funding_validator.validate.assert_awaited_once_with(
        funder_id=None,
        selected_funding_opportunity_id=None,
    )


async def test_start_run_rejects_reused_key_with_different_fingerprint() -> None:
    """Return 409 when an idempotency key is replayed with changed inputs."""
    payload = _start_request()
    service, repository, _, _ = _run_service()
    repository.create_or_get.return_value = (
        _persisted_run(payload, request_fingerprint="different-request"),
        False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.start_run(payload, authorization="Bearer token")

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "idempotency_key_reused"


async def test_get_run_rejects_authenticated_user_mismatch() -> None:
    """Return 403 before reading storage for a mismatched token subject."""
    service, repository, _, _ = _run_service(canonical_user_id="other-user")

    with pytest.raises(HTTPException) as exc_info:
        await service.get_run(
            run_id=uuid4(),
            requested_user_id="owner-1",
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 403
    repository.get_for_user.assert_not_awaited()


async def test_get_run_hides_missing_or_unowned_run() -> None:
    """Return the same 404 for a missing run or one owned by another user."""
    service, repository, cc_client, _ = _run_service()
    repository.get_for_user.return_value = None
    run_id = uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await service.get_run(
            run_id=run_id,
            requested_user_id="owner-1",
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 404
    repository.get_for_user.assert_awaited_once_with(
        run_id=run_id,
        user_id="owner-1",
    )
    cc_client.get_city.assert_not_awaited()


async def test_get_run_revalidates_city_access_owned_by_citycatalyst() -> None:
    """Reject a stored run when current CityCatalyst city access is revoked."""
    payload = _start_request()
    run = _persisted_run(
        payload,
        request_fingerprint=_request_fingerprint(payload),
    )
    service, repository, cc_client, _ = _run_service()
    repository.get_for_user.return_value = run
    cc_client.get_city.side_effect = CityCatalystClientError(
        "City access revoked",
        status_code=403,
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.get_run(
            run_id=run.run_id,
            requested_user_id=payload.user_id,
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "CityCatalyst authorization failed"
    cc_client.get_city.assert_awaited_once_with(
        city_id=str(payload.city_id),
        token="token",
        user_id=payload.user_id,
    )


async def test_thread_ownership_rejects_missing_and_wrong_user_threads() -> None:
    """Require both an existing thread and its matching user without a run FK."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    owned_thread_id = uuid4()

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Thread.__table__.create)

        async with session_factory() as session:
            session.add(Thread(thread_id=owned_thread_id, user_id="owner-1"))
            await session.commit()
            repository = ConceptNoteRunRepository(session)

            assert await repository.thread_belongs_to_user(
                thread_id=owned_thread_id,
                user_id="owner-1",
            )
            assert not await repository.thread_belongs_to_user(
                thread_id=owned_thread_id,
                user_id="other-user",
            )
            assert not await repository.thread_belongs_to_user(
                thread_id=uuid4(),
                user_id="owner-1",
            )
    finally:
        await engine.dispose()
