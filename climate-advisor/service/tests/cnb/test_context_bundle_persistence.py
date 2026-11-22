from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest
from app.db import Base
from app.models.cnb.concept_note_markdown import (
    ConceptNoteMarkdownRequest,
    ConceptNoteUploadCreateRequest,
)
from app.models.cnb.context_bundle import SelectedSource, SourceExcerpt
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    ContextBundlePersistenceError,
    begin_build,
    complete_build,
    fail_build,
    load_agent_context,
    load_query_source,
    load_refresh_state,
    recover_stale_builds,
    set_selected_inventory,
)
from app.persistence.concept_notes.markdown import (
    ConceptNoteMarkdownRepositoryError,
    SqlAlchemyConceptNoteMarkdownRepository,
)
from app.persistence.concept_notes.runs import ConceptNoteRunRepository
from app.services.cnb.visual_context import VISUAL_CONTEXT_CONTRACT_VERSION
from app.services.concept_note_runs import _to_list_item, _to_upload_response
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tests.cnb.test_context_bundle_service import VISUAL_ENVELOPE

Sessions = async_sessionmaker


@pytest.fixture
async def sessions(tmp_path) -> AsyncIterator[Sessions]:
    """An isolated SQLite database holding the run, bundle and upload tables."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'context-bundle.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[
                    ConceptNoteRun.__table__,
                    ConceptNoteContextBundle.__table__,
                    ConceptNoteUpload.__table__,
                ],
            )
        )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


def concept_note_run(
    run_id: UUID,
    *,
    context_summary: dict | None = None,
) -> ConceptNoteRun:
    return ConceptNoteRun(
        run_id=run_id,
        user_id="owner",
        name="Run",
        city_id=str(uuid4()),
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
        context_summary=context_summary or {},
        permission_summary={},
    )


def upload(
    *,
    run_id: UUID,
    status: str = "ready",
    received_at: datetime | None = None,
    filename: str | None = None,
) -> ConceptNoteUpload:
    upload_id = uuid4()
    ready = status == "ready"
    return ConceptNoteUpload(
        upload_id=upload_id,
        run_id=run_id,
        uploaded_by_user_id="owner",
        filename=filename or f"{upload_id}.pdf",
        source_label=None,
        markdown_s3_key=f"{upload_id}.md" if ready else None,
        markdown_sha256=(str(upload_id.int).zfill(64)[-64:] if ready else None),
        page_count=1 if ready else None,
        ingest_status=status,
        received_at=received_at or datetime.now(timezone.utc),
    )


def selected(upload_row: ConceptNoteUpload, **fields: Any) -> SelectedSource:
    assert upload_row.markdown_sha256 is not None
    values = {
        "upload_id": upload_row.upload_id,
        "source_label": upload_row.filename,
        "filename": upload_row.filename,
        "sha256": upload_row.markdown_sha256,
        "page_count": 1,
        "summary": "Document summary.",
        "topics": ["topic"],
        "key_excerpts": [SourceExcerpt(text="Exact text", page=1)],
    }
    return SelectedSource(**{**values, **fields})


async def add(sessions: Sessions, *rows: object) -> None:
    async with sessions() as session, session.begin():
        session.add_all(rows)


async def stored_run(sessions: Sessions, run_id: UUID) -> ConceptNoteRun:
    async with sessions() as session:
        return await session.get(ConceptNoteRun, run_id)


async def stored_bundle(sessions: Sessions, run_id: UUID) -> dict:
    async with sessions() as session:
        return (await session.get(ConceptNoteContextBundle, run_id)).context_bundle


async def begin(
    sessions: Sessions, run_id: UUID, *, force: bool = False
) -> ContextBundleBuildSnapshot:
    return await begin_build(
        session_factory=sessions,
        user_id="owner",
        run_id=run_id,
        build_id=uuid4(),
        force=force,
    )


async def complete(
    sessions: Sessions,
    snapshot: ContextBundleBuildSnapshot,
    sources: list[SelectedSource] | None = None,
    **fields: Any,
) -> bool:
    """Commit a build with no optional sources unless the test supplies them."""
    values = {
        "ghgi": None,
        "hiap": None,
        "optional_sources": {"ghgi": "missing", "hiap": "missing"},
        "warnings": [],
    }
    return await complete_build(
        session_factory=sessions,
        user_id="owner",
        run_id=snapshot.run_id,
        build_id=snapshot.build_id,
        selected_sources=sources or [],
        **{**values, **fields},
    )


async def query_source(
    sessions: Sessions, run_id: UUID, source_index: int, *, user_id: str = "owner"
):
    return await load_query_source(
        session_factory=sessions,
        user_id=user_id,
        run_id=run_id,
        source_index=source_index,
    )


async def agent_context(sessions: Sessions, run_id: UUID) -> dict:
    context = await load_agent_context(
        session_factory=sessions, user_id="owner", run_id=run_id
    )
    assert context is not None
    return context


async def test_plan_role_survives_standard_delivery_retry_reload_and_list(
    sessions,
) -> None:
    run_id, upload_id = uuid4(), uuid4()
    run = concept_note_run(run_id)
    payload = ConceptNoteUploadCreateRequest(
        upload_id=upload_id,
        user_id="owner",
        filename="climate-plan.pdf",
        source_role="climate_action_plan",
        source_label="Climate Action Plan",
    )
    repository = SqlAlchemyConceptNoteMarkdownRepository(sessions)
    await add(sessions, run)
    created = await repository.create_upload(
        user_id="owner", run_id=run_id, payload=payload
    )
    assert created.source_role == "climate_action_plan"
    assert (
        await repository.create_upload(user_id="owner", run_id=run_id, payload=payload)
    ).source_role == "climate_action_plan"
    with pytest.raises(ConceptNoteMarkdownRepositoryError) as conflict:
        await repository.create_upload(
            user_id="owner",
            run_id=run_id,
            payload=payload.model_copy(update={"source_role": "reference"}),
        )
    assert conflict.value.code == "upload_identity_conflict"

    await repository.mark_failed(
        user_id="owner", run_id=run_id, upload_id=upload_id, error_code="ocr_failed"
    )
    retried = await repository.retry_upload(
        user_id="owner", run_id=run_id, upload_id=upload_id
    )
    assert retried.status == "queued" and retried.source_role == "climate_action_plan"
    delivered = await repository.register_markdown(
        user_id="owner",
        run_id=run_id,
        upload_id=upload_id,
        payload=ConceptNoteMarkdownRequest(
            markdown_s3_key=f"{upload_id}.md",
            filename=payload.filename,
            source_label=payload.source_label,
            page_count=1,
            sha256="a" * 64,
        ),
    )
    assert delivered.status == "ready" and delivered.source_role == "climate_action_plan"

    snapshot = await begin(sessions, run_id)
    assert snapshot.uploads[0].source_role == "climate_action_plan"
    building = await stored_run(sessions, run_id)
    assert building.context_summary["context_bundle"]["included_upload_ids"] == []
    async with sessions() as session:
        row = await session.get(ConceptNoteUpload, upload_id)
    assert await complete(sessions, snapshot, [selected(row)])

    async with sessions() as session:
        listed = await ConceptNoteRunRepository(session).list_for_user_city(
            user_id="owner", city_id=run.city_id
        )
        serialized = _to_list_item(listed[0], uploads=listed[0].uploads)
        assert serialized.uploads[0].source_role == "climate_action_plan"
        assert serialized.progress_summary["context_bundle"]["included_upload_ids"] == [
            str(upload_id)
        ]
        persisted = await session.get(ConceptNoteUpload, upload_id)
        assert _to_upload_response(persisted).source_role == "climate_action_plan"
    assert (
        await repository.get_upload(user_id="owner", run_id=run_id, upload_id=upload_id)
    ).source_role == "climate_action_plan"


async def test_progress_identifies_inventory_from_persisted_bundle(sessions) -> None:
    run_id = uuid4()
    first_inventory = uuid4()
    second_inventory = uuid4()
    await add(sessions, concept_note_run(run_id))

    first_build = await begin(sessions, run_id)
    assert await complete(
        sessions,
        first_build,
        ghgi={"inventory": {"id": str(first_inventory), "year": 2024}},
        hiap={"inventory_id": str(first_inventory)},
        optional_sources={"ghgi": "included", "hiap": "included"},
        inventory_candidate={
            "inventory_id": str(first_inventory),
            "updated_at": "2026-09-01T10:00:00Z",
        },
    )
    progress = (await stored_run(sessions, run_id)).context_summary["context_bundle"]
    assert progress["source_provenance"] == {
        "ghgi": {"inventory_id": str(first_inventory), "inventory_year": 2024}
    }
    # The first bundle has no predecessor, so nothing is reported as new.
    assert progress["context_changes"] == []

    await set_selected_inventory(
        session_factory=sessions,
        user_id="owner",
        run_id=run_id,
        inventory_id=second_inventory,
    )
    state = await load_refresh_state(
        session_factory=sessions, user_id="owner", run_id=run_id
    )
    assert state.status == "ready"
    assert state.selected_inventory_id == second_inventory
    assert state.inventory_candidate == {
        "inventory_id": str(first_inventory),
        "updated_at": "2026-09-01T10:00:00Z",
    }

    next_build = await begin(sessions, run_id, force=True)
    progress = (await stored_run(sessions, run_id)).context_summary["context_bundle"]
    assert progress["source_provenance"]["ghgi"]["inventory_id"] == str(first_inventory)
    assert next_build.selected_inventory_id == second_inventory
    assert await complete(
        sessions,
        next_build,
        ghgi={"inventory": {"id": str(second_inventory), "year": 2025}},
        optional_sources={"ghgi": "included", "hiap": "missing"},
    )
    progress = (await stored_run(sessions, run_id)).context_summary["context_bundle"]
    assert progress["source_provenance"] == {
        "ghgi": {"inventory_id": str(second_inventory), "inventory_year": 2025}
    }
    assert progress["context_changes"] == [
        {"source": "ghgi", "change": "changed", "inventory_year": 2025},
        {"source": "hiap", "change": "removed"},
    ]


async def test_rebuild_reports_inventory_with_new_data_as_updated(sessions) -> None:
    run_id = uuid4()
    inventory = uuid4()
    await add(sessions, concept_note_run(run_id))

    for updated_at in ("2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z"):
        assert await complete(
            sessions,
            await begin(sessions, run_id, force=True),
            ghgi={"inventory": {"id": str(inventory), "year": 2024}},
            optional_sources={"ghgi": "partial", "hiap": "missing"},
            inventory_candidate={"inventory_id": str(inventory), "updated_at": updated_at},
        )

    progress = (await stored_run(sessions, run_id)).context_summary["context_bundle"]
    # Same inventory, newer data: the rebuild must announce it as updated.
    assert progress["context_changes"] == [
        {"source": "ghgi", "change": "updated", "inventory_year": 2024}
    ]


async def test_inventory_selection_waits_for_drafting(sessions) -> None:
    run_id = uuid4()
    await add(
        sessions,
        concept_note_run(
            run_id, context_summary={"draft_document": {"status": "running"}}
        ),
    )

    state = await load_refresh_state(
        session_factory=sessions, user_id="owner", run_id=run_id
    )
    assert state.draft_running is True
    with pytest.raises(ContextBundlePersistenceError) as error:
        await set_selected_inventory(
            session_factory=sessions,
            user_id="owner",
            run_id=run_id,
            inventory_id=uuid4(),
        )
    assert (error.value.code, error.value.status_code) == ("draft_running", 409)


async def test_pdf_only_commit_uses_typed_empties_and_preserves_other_sections(
    sessions,
) -> None:
    run_id = uuid4()
    now = datetime.now(timezone.utc)
    ready_upload = upload(run_id=run_id, received_at=now)
    await add(
        sessions,
        concept_note_run(run_id, context_summary={"unrelated": {"keep": True}}),
        ConceptNoteContextBundle(
            run_id=run_id,
            context_bundle={
                "cc_context": {"city": {"name": "Test City"}},
                "funder_context": {"name": "Existing funder"},
                "future_section": {"keep": True},
            },
        ),
        ready_upload,
        upload(run_id=run_id, status="queued", received_at=now + timedelta(seconds=1)),
    )

    snapshot = await begin(sessions, run_id)
    assert [item.upload_id for item in snapshot.uploads] == [ready_upload.upload_id]
    assert await complete(sessions, snapshot, [selected(ready_upload)]) is True

    bundle = await stored_bundle(sessions, run_id)
    run = await stored_run(sessions, run_id)
    assert bundle["cc_context"] == {
        "city": {"name": "Test City"},
        "project": None,
        "ghgi": None,
        "ccra": None,
        "hiap": None,
    }
    assert bundle["funder_context"] == {"name": "Existing funder"}
    assert bundle["similar_projects"] == []
    assert bundle["document_context"] is None
    assert bundle["future_section"] == {"keep": True}
    assert run.workflow_step == "interviewing"
    assert run.context_summary["unrelated"] == {"keep": True}
    progress = run.context_summary["context_bundle"]
    assert progress["status"] == "ready"
    assert progress["source_counts"] == {
        "ready": 1, "queued": 1, "processing": 0, "failed": 0
    }
    assert progress["document_grounding"] == "uploaded_evidence"
    assert {key for key, available in progress["available_context"].items() if available} == {
        "city",
        "uploaded_documents",
    }
    # A late failure must not replace the ready bundle.
    assert (
        await fail_build(
            session_factory=sessions,
            user_id="owner",
            run_id=run_id,
            build_id=snapshot.build_id,
            error_code="late_failure",
            warning="A late failure must not replace a ready bundle.",
        )
        is False
    )

    # Sources stay queryable during a rebuild, but only by their owner.
    assert (await query_source(sessions, run_id, 1)).source.upload_id == ready_upload.upload_id
    replacement = await begin(sessions, run_id, force=True)
    assert [source.upload_id for source in replacement.previous_sources] == [
        ready_upload.upload_id
    ]
    assert (await query_source(sessions, run_id, 1)).source.upload_id == ready_upload.upload_id
    with pytest.raises(ContextBundlePersistenceError) as forbidden:
        await query_source(sessions, run_id, 1, user_id="other-user")
    assert forbidden.value.code == "concept_note_run_forbidden"

    async with sessions() as session, session.begin():
        (await session.get(ConceptNoteRun, run_id)).workflow_step = "assembling_context"
    with pytest.raises(ContextBundlePersistenceError) as wrong_step:
        await query_source(sessions, run_id, 1)
    assert wrong_step.value.code == "concept_note_source_query_not_allowed"


async def test_agent_projection_removes_ids_but_keeps_backend_identity(
    sessions,
) -> None:
    run_id = uuid4()
    source_upload = upload(run_id=run_id, filename="plan.pdf")
    source = selected(source_upload)
    await add(
        sessions,
        concept_note_run(run_id),
        source_upload,
        ConceptNoteContextBundle(
            run_id=run_id,
            context_bundle={
                "cc_context": {"city": {"cityId": "internal-city", "name": "Example City"}},
                "funder_context": {"funder_id": "internal-funder", "name": "Example Fund"},
                "document_context": {"revision_id": "internal-revision", "title": "Proposal"},
            },
        ),
    )
    snapshot = await begin(sessions, run_id)
    assert await complete(sessions, snapshot, [source])

    context = await agent_context(sessions, run_id)
    assert "concept_note_run_id" not in context
    agent_source = context["selected_sources"][0]
    assert agent_source["source_index"] == 1
    for key in ("upload_id", "page_count", "block_count"):
        assert key not in agent_source
    assert "build_id" not in context["context_bundle_status"]
    assert "source_fingerprint" not in context["context_bundle_status"]
    assert context["cc_context"]["city"] == {"name": "Example City"}
    assert context["funder_context"] == {"name": "Example Fund"}
    assert context["document_context"] == {"title": "Proposal"}

    # The stored bundle keeps every identity the backend needs.
    bundle = await stored_bundle(sessions, run_id)
    stored_source = bundle["selected_sources"][0]
    assert stored_source["upload_id"] == str(source_upload.upload_id)
    assert stored_source["sha256"] == source.sha256
    assert stored_source["page_count"] == source.page_count
    assert stored_source["block_count"] == source.block_count
    assert bundle["cc_context"]["city"]["cityId"] == "internal-city"
    run = await stored_run(sessions, run_id)
    assert run.context_summary["context_bundle"]["build_id"] == str(snapshot.build_id)


async def test_agent_context_marks_the_newest_uploaded_source(sessions) -> None:
    run_id = uuid4()
    first_at = datetime(2026, 9, 25, 3, 27, tzinfo=timezone.utc)
    brief = upload(run_id=run_id, received_at=first_at, filename="project-brief.pdf")
    plan = upload(
        run_id=run_id,
        received_at=first_at + timedelta(minutes=33),
        filename="climate-action-plan.pdf",
    )
    await add(sessions, concept_note_run(run_id), brief, plan)
    assert await complete(
        sessions, await begin(sessions, run_id), [selected(brief), selected(plan)]
    )

    context = await agent_context(sessions, run_id)
    sources = {source["filename"]: source for source in context["selected_sources"]}
    assert sources["climate-action-plan.pdf"]["newest"] is True
    assert sources["project-brief.pdf"]["newest"] is False
    assert (
        datetime.fromisoformat(sources["project-brief.pdf"]["uploaded_at"]).replace(
            tzinfo=timezone.utc
        )
        == first_at
    )


async def test_source_index_lookup_disambiguates_duplicate_names(sessions) -> None:
    run_id = uuid4()
    uploads = [upload(run_id=run_id, filename="plan.pdf") for _ in range(2)]
    await add(sessions, concept_note_run(run_id), *uploads)
    assert await complete(
        sessions, await begin(sessions, run_id), [selected(item) for item in uploads]
    )

    context = await agent_context(sessions, run_id)
    assert [source["source_index"] for source in context["selected_sources"]] == [1, 2]
    assert (await query_source(sessions, run_id, 1)).source.upload_id == uploads[0].upload_id
    assert (await query_source(sessions, run_id, 2)).source.upload_id == uploads[1].upload_id
    with pytest.raises(ContextBundlePersistenceError) as unavailable:
        await query_source(sessions, run_id, 3)
    assert unavailable.value.code == "concept_note_source_not_selected"


async def test_no_upload_commit_advances_run_and_loads_agent_context(
    sessions,
) -> None:
    """Persist an interview-ready bundle even when no source is attached."""
    run_id = uuid4()
    await add(
        sessions,
        concept_note_run(
            run_id,
            context_summary={"manual_population": {"population": 123456, "year": 2024}},
        ),
        ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
    )

    snapshot = await begin(sessions, run_id)
    assert snapshot.uploads == []
    assert await complete(
        sessions, snapshot, warnings=["No source document is attached."]
    )

    run = await stored_run(sessions, run_id)
    assert run.workflow_step == "interviewing"
    progress = run.context_summary["context_bundle"]
    assert progress["status"] == "ready"
    assert progress["document_grounding"] == "none"
    assert not any(progress["available_context"].values())
    assert progress["missing_context"] == ["source_documents"]
    assert progress["source_counts"]["ready"] == 0

    context = await agent_context(sessions, run_id)
    assert context["selected_sources"] == []
    assert context["manual_population"] == {
        "population": 123456,
        "year": 2024,
        "source": "user_entered",
    }
    assert context["cc_context"]["city"] is None
    assert context["context_bundle_status"]["document_grounding"] == "none"

    # While rebuilding, the agent keeps the last known grounding and availability.
    await begin(sessions, run_id, force=True)
    rebuilding = (await agent_context(sessions, run_id))["context_bundle_status"]
    assert rebuilding["status"] == "building"
    assert rebuilding["document_grounding"] == "none"
    assert rebuilding["available_context"] == progress["available_context"]


async def test_stale_build_cannot_replace_newer_ready_upload_set(sessions) -> None:
    run_id = uuid4()
    now = datetime.now(timezone.utc)
    first = upload(run_id=run_id, received_at=now)
    second = upload(run_id=run_id, received_at=now + timedelta(seconds=1))
    await add(
        sessions,
        concept_note_run(run_id),
        ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
        first,
    )
    older = await begin(sessions, run_id)
    await add(sessions, second)
    assert await complete(sessions, older, [selected(first)]) is False

    newer = await begin(sessions, run_id)
    assert await complete(sessions, newer, [selected(first), selected(second)])
    bundle = await stored_bundle(sessions, run_id)
    assert [row["upload_id"] for row in bundle["selected_sources"]] == [
        str(first.upload_id),
        str(second.upload_id),
    ]


async def test_failed_build_is_retryable_and_keeps_bundle_unready(sessions) -> None:
    run_id = uuid4()
    await add(
        sessions,
        concept_note_run(run_id),
        ConceptNoteContextBundle(run_id=run_id, context_bundle={}),
    )
    snapshot = await begin(sessions, run_id)
    assert snapshot.uploads == []
    assert (
        await fail_build(
            session_factory=sessions,
            user_id="owner",
            run_id=run_id,
            build_id=snapshot.build_id,
            error_code="context_bundle_build_failed",
            error_reason="reader_section_count_mismatch",
            error_details={"expected_sections": 106, "returned_sections": 4},
            warning="The context bundle could not be built.",
        )
        is True
    )
    run = await stored_run(sessions, run_id)
    progress = run.context_summary["context_bundle"]
    assert run.status == "active"
    assert progress["status"] == "failed"
    assert progress["retryable"] is True
    assert progress["error_reason"] == "reader_section_count_mismatch"
    assert progress["error_details"] == {"expected_sections": 106, "returned_sections": 4}
    assert progress["completion_event"] is None


async def test_recovery_marks_only_stale_building_runs_retryable(sessions) -> None:
    now = datetime.now(timezone.utc)

    def run(status: str, age: timedelta) -> ConceptNoteRun:
        row = concept_note_run(
            uuid4(), context_summary={"context_bundle": {"status": status}}
        )
        row.updated_at = now - age
        return row

    old_building = run("building", timedelta(hours=2))
    recent_building = run("building", timedelta(minutes=10))
    ready = run("ready", timedelta(hours=2))
    await add(sessions, old_building, recent_building, ready)

    recovered = await recover_stale_builds(
        session_factory=sessions, stale_before=now - timedelta(hours=1)
    )

    assert recovered == 1
    old_progress = (await stored_run(sessions, old_building.run_id)).context_summary[
        "context_bundle"
    ]
    assert old_progress["status"] == "failed"
    assert old_progress["error_code"] == "context_bundle_build_interrupted"
    assert old_progress["retryable"] is True
    for unchanged, status in ((recent_building, "building"), (ready, "ready")):
        stored = await stored_run(sessions, unchanged.run_id)
        assert stored.context_summary["context_bundle"]["status"] == status


def _structured_upload(run_id: UUID, structured_sha: str) -> ConceptNoteUpload:
    row = upload(run_id=run_id, filename="city.pdf")
    row.source_label = "City plan"
    row.annotation_mode = "visual_context"
    row.structured_s3_key = "document.structured.json"
    row.structured_sha256 = structured_sha
    row.structured_size_bytes = 128
    row.structured_schema_version = "citycatalyst.structured-document.1"
    return row


def _visual_source(row: ConceptNoteUpload, **fields: Any) -> SelectedSource:
    return selected(
        row,
        source_label="City plan",
        visual_context_contract_version=VISUAL_CONTEXT_CONTRACT_VERSION,
        structured_sha256=row.structured_sha256,
        structured_schema_version=row.structured_schema_version,
        **fields,
    )


async def test_begin_build_rebuilds_ready_bundle_when_visual_contract_is_stale(
    sessions,
) -> None:
    """Unchanged uploads still rebuild when cached visual context predates the contract."""
    run_id = uuid4()
    ready = _structured_upload(run_id, "b" * 64)
    await add(sessions, concept_note_run(run_id), ready)
    current_source = _visual_source(ready, visual_context=[])
    assert await complete(sessions, await begin(sessions, run_id), [current_source])
    # Replace the stored source with one cached before the visual-context contract.
    legacy_source = {
        **current_source.model_dump(mode="json", exclude={"visual_context_contract_version"}),
        "visual_context": [
            {
                "source": "image_annotation",
                "quantitative_reliability": "unverified",
                "kind": "chart",
                "chart_type": "line",
                "title": "Transport",
                "meaning": "Transport declines",
            }
        ],
    }
    async with sessions() as session, session.begin():
        bundle = await session.get(ConceptNoteContextBundle, run_id)
        bundle.context_bundle = {**bundle.context_bundle, "selected_sources": [legacy_source]}

    stale = await begin(sessions, run_id)
    assert stale.already_current is False
    assert stale.previous_sources[0].visual_context == []
    assert stale.previous_sources[0].visual_context_contract_version is None

    assert await complete(sessions, stale, [current_source])
    ready_again = await begin(sessions, run_id)
    assert ready_again.already_current is True
    assert (
        ready_again.previous_sources[0].visual_context_contract_version
        == VISUAL_CONTEXT_CONTRACT_VERSION
    )


async def test_load_agent_context_keeps_full_visual_envelope(sessions) -> None:
    """Runtime chat JSON retains the complete unverified provider annotation."""
    run_id = uuid4()
    ready = _structured_upload(run_id, "d" * 64)
    await add(sessions, concept_note_run(run_id), ready)
    source = _visual_source(ready, visual_context=[VISUAL_ENVELOPE])
    assert await complete(sessions, await begin(sessions, run_id), [source])

    context = await agent_context(sessions, run_id)
    assert context["selected_sources"][0]["visual_context"] == [VISUAL_ENVELOPE]


async def test_progress_reports_the_city_population_the_models_receive(
    sessions,
) -> None:
    run_id = uuid4()
    city = {"name": "Kraków", "population": 1_000_000, "population_year": 2025}
    stored_population = {"population": 1_000_000, "year": 2025}

    async def build(city_profile: dict | None) -> dict:
        snapshot = await begin(sessions, run_id, force=True)
        building = (await stored_run(sessions, run_id)).context_summary
        assert await complete(
            sessions,
            snapshot,
            city=city_profile,
            optional_sources={"city": "available", "ghgi": "missing", "hiap": "missing"},
        )
        ready = (await stored_run(sessions, run_id)).context_summary
        return {"building": building["context_bundle"], "ready": ready["context_bundle"]}

    await add(sessions, concept_note_run(run_id))

    # A city profile without a population record reports no population.
    first = await build({**city, "population": None})
    assert first["building"]["city_population"] is None
    assert first["building"]["optional_sources"]["city"] == "pending"
    assert first["ready"]["available_context"]["city"] is True
    assert first["ready"]["city_population"] is None

    second = await build(city)
    assert second["ready"]["city_population"] == stored_population

    # A rebuild whose city lookup fails keeps reporting the stored figure.
    third = await build(None)
    assert third["building"]["city_population"] == stored_population
    assert third["ready"]["city_population"] == stored_population

    # A forced rebuild whose population-only lookup fails keeps the figure.
    fourth = await build(
        {
            **city,
            "name": "Kraków (renamed)",
            "population": None,
            "population_year": None,
            "population_lookup_failed": True,
        }
    )
    assert fourth["ready"]["city_population"] == stored_population
    stored_city = (await stored_bundle(sessions, run_id))["cc_context"]["city"]
    assert stored_city["name"] == "Kraków (renamed)"
    assert stored_city["population"] == 1_000_000
    assert stored_city["population_year"] == 2025
    assert "population_lookup_failed" not in stored_city

    # A genuine no-population response still clears the stored figure.
    fifth = await build({**city, "population": None, "population_year": None})
    assert fifth["ready"]["city_population"] is None
