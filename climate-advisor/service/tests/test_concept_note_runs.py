from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.cnb.concept_note_runs import (
    ConceptNoteRunListResponse,
    ConceptNoteStartRequest,
)
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.thread import Thread
from app.persistence.concept_notes.runs import ConceptNoteRunRepository
from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
)
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.funding_references import FundingReferenceValidator
from app.services.concept_note_runs import (
    ConceptNoteRunService,
    _request_fingerprint,
)


def _start_request(
    *,
    user_id: str = "owner-1",
    city_id: UUID | None = None,
) -> ConceptNoteStartRequest:
    """Build a valid run-start request for service tests."""
    return ConceptNoteStartRequest(
        user_id=user_id,
        name="Resilient neighborhoods",
        city_id=city_id or uuid4(),
        idempotency_key=uuid4(),
    )


def _persisted_run(
    payload: ConceptNoteStartRequest,
    *,
    request_fingerprint: str,
    run_id: UUID | None = None,
    status: str = "active",
    workflow_step: str = "assembling_context",
    context_summary: dict[str, object] | None = None,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> ConceptNoteRun:
    """Build the persisted run shape returned by the repository."""
    now = datetime.now(timezone.utc)
    return ConceptNoteRun(
        run_id=run_id or uuid4(),
        thread_id=payload.thread_id,
        user_id=payload.user_id,
        name=payload.name,
        city_id=str(payload.city_id),
        project_id=payload.project_id,
        funder_id=payload.funder_id,
        selected_funding_opportunity_id=payload.selected_funding_opportunity_id,
        status=status,
        workflow_step=workflow_step,
        context_summary=context_summary or {},
        permission_summary={},
        trace_id=None,
        idempotency_key=payload.idempotency_key,
        request_fingerprint=request_fingerprint,
        created_at=created_at or now,
        updated_at=updated_at or now,
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


async def _list_runs(
    service: ConceptNoteRunService,
    *,
    user_id: str = "owner-1",
    city_id: UUID | None = None,
    authorization: str | None = "Bearer token",
) -> ConceptNoteRunListResponse:
    """List runs with the default authorized test scope."""
    return await service.list_runs(
        requested_user_id=user_id,
        city_id=city_id or uuid4(),
        authorization=authorization,
    )


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


@pytest.mark.parametrize("created", [True, False])
async def test_start_run_schedules_only_new_context_after_commit(
    monkeypatch,
    created: bool,
) -> None:
    """Commit every accepted start and schedule only newly created runs."""
    payload = _start_request()
    service, repository, _, _ = _run_service()
    repository.create_or_get.return_value = (
        _persisted_run(
            payload,
            request_fingerprint=_request_fingerprint(payload),
        ),
        created,
    )
    context_bundle_service = Mock(spec=ContextBundleService)
    schedule = Mock()
    events: list[str] = []
    service.session.commit.side_effect = lambda: events.append("commit")
    schedule.side_effect = lambda **_: events.append("schedule")
    monkeypatch.setattr(
        "app.services.concept_note_runs.schedule_context_bundle_build",
        schedule,
    )

    response = await service.start_run_and_schedule_context(
        payload,
        authorization="Bearer token",
        context_bundle_service=context_bundle_service,
    )

    assert response.created is created
    assert events == (["commit", "schedule"] if created else ["commit"])
    service.session.commit.assert_awaited_once_with()
    if created:
        schedule.assert_called_once_with(
            service=context_bundle_service,
            user_id=payload.user_id,
            run_id=response.run_id,
            token="token",
        )
    else:
        schedule.assert_not_called()


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


async def test_list_runs_rejects_authenticated_user_mismatch() -> None:
    """Reject a requested owner that differs from the bearer-token subject."""
    service, repository, _, _ = _run_service(canonical_user_id="other-user")

    with pytest.raises(HTTPException) as exc_info:
        await _list_runs(service)

    assert exc_info.value.status_code == 403
    repository.list_for_user_city.assert_not_awaited()


async def test_list_runs_maps_identity_outage_to_service_unavailable() -> None:
    """Do not query runs when token identity cannot be validated."""
    service, repository, cc_client, _ = _run_service()
    cc_client.validate_user_identity.side_effect = CityCatalystClientError(
        "CityCatalyst unavailable",
        status_code=500,
    )

    with pytest.raises(HTTPException) as exc_info:
        await _list_runs(service)

    assert exc_info.value.status_code == 503
    cc_client.get_city.assert_not_awaited()
    repository.list_for_user_city.assert_not_awaited()


async def test_list_runs_requires_bearer_token() -> None:
    """Reject a list request without a CityCatalyst bearer token."""
    service, repository, cc_client, _ = _run_service()

    with pytest.raises(HTTPException) as exc_info:
        await _list_runs(service, authorization=None)

    assert exc_info.value.status_code == 401
    cc_client.validate_user_identity.assert_not_awaited()
    repository.list_for_user_city.assert_not_awaited()


async def test_list_runs_revalidates_city_access_before_querying() -> None:
    """Do not query persisted runs when current city access is revoked."""
    service, repository, cc_client, _ = _run_service()
    city_id = uuid4()
    cc_client.get_city.side_effect = CityCatalystClientError(
        "City access revoked",
        status_code=403,
    )

    with pytest.raises(HTTPException) as exc_info:
        await _list_runs(service, city_id=city_id)

    assert exc_info.value.status_code == 403
    repository.list_for_user_city.assert_not_awaited()


async def test_list_runs_maps_city_authorization_outage_to_service_unavailable() -> None:
    """Keep authorization integration failures distinct from access denial."""
    service, repository, cc_client, _ = _run_service()
    cc_client.get_city.side_effect = CityCatalystClientError(
        "CityCatalyst unavailable",
        status_code=500,
    )

    with pytest.raises(HTTPException) as exc_info:
        await _list_runs(service)

    assert exc_info.value.status_code == 503
    repository.list_for_user_city.assert_not_awaited()


async def test_list_runs_returns_stable_progress_and_resume_fields() -> None:
    """Use persisted lifecycle and context summary in list and detail reads."""
    payload = _start_request()
    run = _persisted_run(
        payload,
        request_fingerprint=_request_fingerprint(payload),
        status="paused",
        workflow_step="interviewing",
        context_summary={"ready_sources": 3},
    )
    service, repository, _, _ = _run_service()
    repository.list_for_user_city.return_value = [run]
    repository.get_for_user.return_value = run

    listed = await _list_runs(
        service,
        user_id=payload.user_id,
        city_id=payload.city_id,
    )
    detailed = await service.get_run(
        run_id=run.run_id,
        requested_user_id=payload.user_id,
        authorization="Bearer token",
    )

    assert listed.runs[0].run_id == detailed.run_id == run.run_id
    assert listed.runs[0].thread_id == detailed.thread_id
    assert listed.runs[0].status == detailed.status == "paused"
    assert listed.runs[0].workflow_step == detailed.workflow_step == "interviewing"
    assert listed.runs[0].progress_summary == detailed.progress_summary == {
        "ready_sources": 3
    }


async def test_list_runs_returns_empty_envelope() -> None:
    """Represent an authorized city without runs as an empty stable list."""
    service, repository, _, _ = _run_service()
    repository.list_for_user_city.return_value = []
    city_id = uuid4()

    response = await _list_runs(service, city_id=city_id)

    assert response.model_dump() == {"runs": []}


async def test_list_runs_defaults_missing_context_summary() -> None:
    """Expose an empty progress object when no context summary is persisted."""
    payload = _start_request()
    run = _persisted_run(
        payload,
        request_fingerprint=_request_fingerprint(payload),
    )
    run.context_summary = None
    service, repository, _, _ = _run_service()
    repository.list_for_user_city.return_value = [run]

    response = await _list_runs(
        service,
        user_id=payload.user_id,
        city_id=payload.city_id,
    )

    assert response.runs[0].progress_summary == {}


async def test_repository_filters_and_orders_city_runs_deterministically() -> None:
    """Filter by owner and city, then break timestamp ties with the run ID."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    city_id = uuid4()
    other_city_id = uuid4()
    now = datetime.now(timezone.utc)
    older = now - timedelta(hours=1)
    low_tie_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    high_tie_id = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")

    try:
        async with engine.begin() as connection:
            await connection.run_sync(ConceptNoteRun.__table__.create)

        owner_payload = _start_request(city_id=city_id)
        other_user_payload = _start_request(user_id="other-user", city_id=city_id)
        other_city_payload = _start_request(city_id=other_city_id)
        runs = [
            _persisted_run(
                owner_payload,
                request_fingerprint="a" * 64,
                run_id=low_tie_id,
                created_at=now,
                updated_at=now,
            ),
            _persisted_run(
                owner_payload.model_copy(update={"idempotency_key": uuid4()}),
                request_fingerprint="b" * 64,
                run_id=high_tie_id,
                created_at=now,
                updated_at=now,
            ),
            _persisted_run(
                owner_payload.model_copy(update={"idempotency_key": uuid4()}),
                request_fingerprint="c" * 64,
                created_at=older,
                updated_at=older,
            ),
            _persisted_run(
                other_user_payload,
                request_fingerprint="d" * 64,
                updated_at=now + timedelta(hours=1),
            ),
            _persisted_run(
                other_city_payload,
                request_fingerprint="e" * 64,
                updated_at=now + timedelta(hours=1),
            ),
        ]

        async with session_factory() as session:
            session.add_all(runs)
            await session.commit()
            repository = ConceptNoteRunRepository(session)

            result = await repository.list_for_user_city(
                user_id="owner-1",
                city_id=str(city_id),
            )

        assert [run.run_id for run in result] == [
            high_tie_id,
            low_tie_id,
            runs[2].run_id,
        ]
    finally:
        await engine.dispose()


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
            session.add(
                Thread(
                    thread_id=owned_thread_id,
                    user_id="owner-1",
                    context={
                        "access_token": "preserved-token",
                        "stationary_energy_draft_run_id": str(uuid4()),
                    },
                )
            )
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
            concept_note_run_id = uuid4()
            await repository.bind_thread_context(
                thread_id=owned_thread_id,
                user_id="owner-1",
                run_id=concept_note_run_id,
            )
            await session.commit()
            stored_thread = await session.get(Thread, owned_thread_id)
            assert stored_thread is not None
            assert stored_thread.context["concept_note_run_id"] == str(
                concept_note_run_id
            )
            assert "stationary_energy_draft_run_id" not in stored_thread.context
            assert stored_thread.context["access_token"] == "preserved-token"
    finally:
        await engine.dispose()
