from __future__ import annotations

import asyncio
import hashlib
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.config import get_settings
from app.models.cnb.context_bundle import SelectedSource
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import (
    CityCatalystClientError,
    ConceptNoteMarkdownArtifact,
)
from app.services.cnb.context_bundle import (
    ContextBundleService,
    run_context_bundle_reconciler,
)
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourceBlock,
    SourcePage,
    source_analysis_contract_version,
)


def fake_verify_source_artifact(
    *, artifact, markdown_s3_key, sha256, source_format, page_count
) -> list[SourcePage | SourceBlock]:
    """Return one source unit after asserting immutable artifact checks."""
    assert artifact.markdown_s3_key == markdown_s3_key
    assert artifact.sha256 == sha256
    assert artifact.source_format == source_format
    assert artifact.page_count == page_count
    if source_format == "pdf":
        return [SourcePage(number=1, text="\nCity evidence")]
    return [SourceBlock(anchor="context/block-abc123", text="\nCity evidence")]


async def fake_analyze_document(**kwargs) -> SelectedSource:
    """Return compact source context without running an LLM."""
    return SelectedSource(
        upload_id=kwargs["upload_id"],
        source_label=kwargs["source_label"] or kwargs["filename"],
        filename=kwargs["filename"],
        sha256=kwargs["sha256"],
        source_format=kwargs["source_format"],
        page_count=1 if kwargs["source_format"] == "pdf" else None,
        block_count=1 if kwargs["source_format"] == "markdown" else None,
        summary="City evidence summary.",
        topics=["city"],
        key_excerpts=[],
    )


@pytest.mark.asyncio
async def test_reconciler_runs_periodically_until_cancelled(monkeypatch) -> None:
    sleep = AsyncMock(side_effect=[None, asyncio.CancelledError()])
    recover_stale_builds = AsyncMock(return_value=1)
    session_factory = object()
    monkeypatch.setattr("app.services.cnb.context_bundle.asyncio.sleep", sleep)
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.get_session_factory",
        lambda: session_factory,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.recover_stale_builds",
        recover_stale_builds,
    )
    resume_source_revalidations = AsyncMock(return_value=0)
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.resume_source_revalidations",
        resume_source_revalidations,
    )

    with pytest.raises(asyncio.CancelledError):
        await run_context_bundle_reconciler(
            interval_seconds=1,
            stale_after=timedelta(hours=1),
        )

    recover_stale_builds.assert_awaited_once()
    assert recover_stale_builds.await_args.kwargs["session_factory"] is session_factory
    resume_source_revalidations.assert_awaited_once()
    assert (
        resume_source_revalidations.await_args.kwargs["session_factory"]
        is session_factory
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source_format", "filename", "markdown", "page_count"),
    [
        ("pdf", "city.pdf", "<!-- page: 1 -->\nCity evidence", 1),
        ("markdown", "city.md", "# City plan\n\nCity evidence", None),
    ],
)
async def test_source_build_completes_with_null_optional_sources(
    monkeypatch,
    source_format,
    filename,
    markdown,
    page_count,
) -> None:
    digest = hashlib.sha256(markdown.encode()).hexdigest()
    run_id = uuid4()
    upload_id = uuid4()
    upload = ConceptNoteUploadSnapshot(
        upload_id=upload_id,
        run_id=run_id,
        user_id="owner",
        filename=filename,
        source_label="City plan",
        markdown_s3_key="result.md",
        markdown_sha256=digest,
        page_count=page_count,
        status="ready",
        error_code=None,
        received_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        source_format=source_format,
    )
    snapshot = ContextBundleBuildSnapshot(
        run_id=run_id,
        city_id=str(uuid4()),
        build_id=uuid4(),
        uploads=[upload],
        already_current=False,
    )
    begin_build = AsyncMock(return_value=snapshot)
    complete_build = AsyncMock(return_value=True)
    fail_build = AsyncMock(return_value=True)
    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(
            return_value=ConceptNoteMarkdownArtifact(
                markdown=markdown,
                markdown_s3_key="result.md",
                sha256=digest,
                source_format=source_format,
                page_count=page_count,
            )
        ),
        close=AsyncMock(),
    )

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=None),
    )
    city_profile = {"name": "Kraków", "population": 800000, "population_year": 2024}
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_city_profile",
        AsyncMock(return_value=city_profile),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        begin_build,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.complete_build",
        complete_build,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.fail_build",
        fail_build,
    )
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        analyze_document_fn=fake_analyze_document,
        verify_source_artifact_fn=fake_verify_source_artifact,
        cc_client_factory=lambda: client,
    )
    assert (
        await service.build(
            user_id="owner",
            run_id=run_id,
            token="token",
        )
        is True
    )
    fail_build.assert_not_awaited()
    completed = complete_build.await_args.kwargs
    assert completed["city"] == city_profile
    assert completed["ghgi"] is None
    assert completed["hiap"] is None
    assert completed["optional_sources"] == {
        "city": "available",
        "ghgi": "missing",
        "hiap": "missing",
    }
    assert [item.upload_id for item in completed["selected_sources"]] == [upload_id]
    assert completed["selected_sources"][0].source_format == source_format
    client.close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_incremental_build_analyzes_only_the_new_upload(monkeypatch) -> None:
    """Reuse an unchanged source and preserve deterministic upload order."""
    run_id = uuid4()
    old_upload_id = uuid4()
    new_upload_id = uuid4()
    old_markdown = "<!-- page: 1 -->\nExisting evidence"
    new_markdown = "<!-- page: 1 -->\nNew evidence"
    old_digest = hashlib.sha256(old_markdown.encode()).hexdigest()
    new_digest = hashlib.sha256(new_markdown.encode()).hexdigest()
    now = datetime.now(UTC)

    def upload(
        upload_id: UUID,
        filename: str,
        digest: str,
    ) -> ConceptNoteUploadSnapshot:
        return ConceptNoteUploadSnapshot(
            upload_id=upload_id,
            run_id=run_id,
            user_id="owner",
            filename=filename,
            source_label=filename,
            markdown_s3_key=f"{upload_id}.md",
            markdown_sha256=digest,
            page_count=1,
            status="ready",
            error_code=None,
            received_at=now,
            completed_at=now,
            source_format="pdf",
        )

    old_upload = upload(old_upload_id, "old.pdf", old_digest)
    new_upload = upload(new_upload_id, "new.pdf", new_digest)
    contract_version = source_analysis_contract_version(get_settings())
    old_analysis = SelectedSource(
        upload_id=old_upload_id,
        source_label="old.pdf",
        filename="old.pdf",
        sha256=old_digest,
        source_format="pdf",
        page_count=1,
        analysis_contract_version=contract_version,
        summary="Accepted existing summary.",
        topics=["existing"],
        key_excerpts=[],
    )
    snapshot = ContextBundleBuildSnapshot(
        run_id=run_id,
        city_id=str(uuid4()),
        build_id=uuid4(),
        uploads=[old_upload, new_upload],
        already_current=False,
        previous_sources=[old_analysis],
    )
    analyze = AsyncMock(side_effect=fake_analyze_document)
    complete_build = AsyncMock(return_value=True)
    artifacts = {
        str(upload_id): ConceptNoteMarkdownArtifact(
            markdown=markdown,
            markdown_s3_key=f"{upload_id}.md",
            sha256=digest,
            source_format="pdf",
            page_count=1,
        )
        for upload_id, markdown, digest in (
            (old_upload_id, old_markdown, old_digest),
            (new_upload_id, new_markdown, new_digest),
        )
    }

    async def get_markdown(*, upload_id: str, token: str) -> ConceptNoteMarkdownArtifact:
        return artifacts[upload_id]

    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(side_effect=get_markdown),
        close=AsyncMock(),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        AsyncMock(return_value=snapshot),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.complete_build",
        complete_build,
    )
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        analyze_document_fn=analyze,
        verify_source_artifact_fn=fake_verify_source_artifact,
        cc_client_factory=lambda: client,
    )

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    # Only the new upload is analyzed; the reused one is re-read for its text.
    analyze.assert_awaited_once()
    assert analyze.await_args.kwargs["upload_id"] == new_upload_id
    assert sorted(
        call.kwargs["upload_id"]
        for call in client.get_concept_note_markdown.await_args_list
    ) == sorted([str(old_upload_id), str(new_upload_id)])
    source_text = complete_build.await_args.kwargs["source_text"]
    assert source_text.mode == "full_text"
    assert [document.upload_id for document in source_text.documents] == [
        old_upload_id,
        new_upload_id,
    ]
    selected_sources = complete_build.await_args.kwargs["selected_sources"]
    assert [source.upload_id for source in selected_sources] == [
        old_upload_id,
        new_upload_id,
    ]
    assert selected_sources[0].summary == "Accepted existing summary."
    assert selected_sources[1].analysis_contract_version == contract_version


@pytest.mark.asyncio
async def test_build_without_uploads_completes_without_document_evidence(
    monkeypatch,
) -> None:
    """Treat missing documents as limited context instead of a build failure."""
    run_id = uuid4()
    snapshot = ContextBundleBuildSnapshot(
        run_id=run_id,
        city_id=str(uuid4()),
        build_id=uuid4(),
        uploads=[],
        already_current=False,
    )
    complete_build = AsyncMock(return_value=True)
    fail_build = AsyncMock(return_value=True)
    client = SimpleNamespace(close=AsyncMock())

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_city_profile",
        AsyncMock(side_effect=CityCatalystClientError("denied", status_code=403)),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        AsyncMock(return_value=snapshot),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.complete_build",
        complete_build,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.fail_build",
        fail_build,
    )
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        cc_client_factory=lambda: client,
    )

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    fail_build.assert_not_awaited()
    completed = complete_build.await_args.kwargs
    assert completed["selected_sources"] == []
    # A failed city lookup is optional: it warns and keeps any stored profile.
    assert completed["city"] is None
    assert completed["optional_sources"] == {
        "city": "unavailable",
        "ghgi": "missing",
        "hiap": "missing",
    }
    assert completed["warnings"] == [
        "No source document is attached; responses use limited context until a source is added.",
        "City profile was unavailable.",
    ]
    client.close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_partial_ghgi_and_usable_hiap_are_retained(monkeypatch) -> None:
    service = ContextBundleService(None)  # type: ignore[arg-type]
    inventory = {"inventory_id": str(uuid4())}
    actions = [SimpleNamespace(action_id="action-1")]

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=inventory),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_ghgi_context",
        AsyncMock(
            return_value=SimpleNamespace(
                availability="partial",
                model_dump=lambda **_: {
                    "availability": "partial",
                    "emissions": {},
                },
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_hiap_context",
        AsyncMock(
            return_value=SimpleNamespace(
                availability="available",
                mitigation=SimpleNamespace(actions=actions),
                adaptation=SimpleNamespace(actions=[]),
                model_dump=lambda **_: {
                    "availability": "available",
                    "actions": [1],
                },
            )
        ),
    )
    ghgi, hiap, statuses, warnings, candidate = await service._load_optional_context(
        user_id="owner",
        city_id=uuid4(),
        token="token",
        cc_client=SimpleNamespace(),  # type: ignore[arg-type]
    )
    assert ghgi == {"availability": "partial", "emissions": {}}
    assert hiap == {"availability": "available", "actions": [1]}
    assert statuses == {"ghgi": "partial", "hiap": "available"}
    assert candidate == {"inventory_id": inventory["inventory_id"], "updated_at": None}
    assert warnings == []


@pytest.mark.asyncio
async def test_optional_source_errors_do_not_fail_source_readiness(monkeypatch) -> None:
    service = ContextBundleService(None)  # type: ignore[arg-type]

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(side_effect=RuntimeError("optional service unavailable")),
    )
    ghgi, hiap, statuses, warnings, candidate = await service._load_optional_context(
        user_id="owner",
        city_id=uuid4(),
        token="token",
        cc_client=SimpleNamespace(),  # type: ignore[arg-type]
    )
    assert ghgi is None and hiap is None
    assert statuses == {"ghgi": "unavailable", "hiap": "unavailable"}
    assert warnings
    assert candidate is None


@pytest.mark.asyncio
async def test_source_failure_preserves_safe_diagnostics_without_source_text(
    monkeypatch,
    caplog,
) -> None:
    failure = SourceAnalysisError(
        "incomplete_source_coverage",
        "private document text must not be logged",
        reason="reader_section_count_mismatch",
        details={"expected_sections": 106, "returned_sections": 4},
    )
    snapshot = ContextBundleBuildSnapshot(
        run_id=uuid4(),
        city_id=str(uuid4()),
        build_id=uuid4(),
        uploads=[SimpleNamespace(upload_id=uuid4())],
        already_current=False,
    )
    client = SimpleNamespace(close=AsyncMock())
    service = ContextBundleService(object(), cc_client_factory=lambda: client)
    monkeypatch.setattr(service, "_analyze_upload", AsyncMock(side_effect=failure))
    persist = AsyncMock(return_value=True)
    monkeypatch.setattr("app.services.cnb.context_bundle.fail_build", persist)
    assert not await service.build(
        user_id="owner",
        run_id=snapshot.run_id,
        token="secret",
        snapshot=snapshot,
    )
    assert persist.await_args.kwargs["error_reason"] == failure.reason
    assert persist.await_args.kwargs["error_details"] == failure.details
    assert "reader_section_count_mismatch" in caplog.text
    assert "106" in caplog.text
    assert "private document text" not in caplog.text
    assert "secret" not in caplog.text
    client.close.assert_awaited_once()


def _source_text_build(
    monkeypatch: pytest.MonkeyPatch,
    *,
    fail_reused_fetch: bool = False,
) -> tuple[ContextBundleService, AsyncMock, UUID, list[UUID]]:
    """Wire one reused and one new PDF upload for source-text budget tests."""
    run_id = uuid4()
    now = datetime.now(UTC)
    contract_version = source_analysis_contract_version(get_settings())
    uploads: list[ConceptNoteUploadSnapshot] = []
    artifacts: dict[str, ConceptNoteMarkdownArtifact] = {}
    for name in ("old.pdf", "new.pdf"):
        upload_id = uuid4()
        markdown = f"<!-- page: 1 -->\n{name} evidence"
        digest = hashlib.sha256(markdown.encode()).hexdigest()
        uploads.append(
            ConceptNoteUploadSnapshot(
                upload_id=upload_id,
                run_id=run_id,
                user_id="owner",
                filename=name,
                source_label=name,
                markdown_s3_key=f"{upload_id}.md",
                markdown_sha256=digest,
                page_count=1,
                status="ready",
                error_code=None,
                received_at=now,
                completed_at=now,
                source_format="pdf",
            )
        )
        artifacts[str(upload_id)] = ConceptNoteMarkdownArtifact(
            markdown=markdown,
            markdown_s3_key=f"{upload_id}.md",
            sha256=digest,
            source_format="pdf",
            page_count=1,
        )
    reused = SelectedSource(
        upload_id=uploads[0].upload_id,
        source_label="old.pdf",
        filename="old.pdf",
        sha256=uploads[0].markdown_sha256,
        source_format="pdf",
        page_count=1,
        analysis_contract_version=contract_version,
        summary="Accepted existing summary.",
        topics=["existing"],
        key_excerpts=[],
    )

    async def get_markdown(*, upload_id: str, token: str) -> ConceptNoteMarkdownArtifact:
        # The reused upload is fetched only to recover its text.
        if fail_reused_fetch and upload_id == str(uploads[0].upload_id):
            raise CityCatalystClientError("unavailable", status_code=503)
        return artifacts[upload_id]

    complete_build = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        AsyncMock(
            return_value=ContextBundleBuildSnapshot(
                run_id=run_id,
                city_id=str(uuid4()),
                build_id=uuid4(),
                uploads=uploads,
                already_current=False,
                previous_sources=[reused],
            )
        ),
    )
    monkeypatch.setattr("app.services.cnb.context_bundle.complete_build", complete_build)
    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(side_effect=get_markdown),
        close=AsyncMock(),
    )
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        analyze_document_fn=fake_analyze_document,
        verify_source_artifact_fn=fake_verify_source_artifact,
        cc_client_factory=lambda: client,
    )
    return service, complete_build, run_id, [upload.upload_id for upload in uploads]


@pytest.mark.asyncio
async def test_source_text_keeps_complete_page_marked_text_within_budget(
    monkeypatch,
) -> None:
    service, complete_build, run_id, upload_ids = _source_text_build(monkeypatch)

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    source_text = complete_build.await_args.kwargs["source_text"]
    assert source_text.mode == "full_text"
    assert 0 < source_text.token_count <= source_text.max_tokens == 80000
    assert [document.upload_id for document in source_text.documents] == upload_ids
    assert source_text.documents[0].text == "<!-- page: 1 -->\nCity evidence"


@pytest.mark.asyncio
async def test_source_text_falls_back_to_summaries_above_the_budget(
    monkeypatch,
) -> None:
    budget = get_settings().llm.generation.prompt_budget.cnb_sources
    monkeypatch.setattr(budget, "full_text_max_tokens", 1)
    service, complete_build, run_id, _ = _source_text_build(monkeypatch)

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    source_text = complete_build.await_args.kwargs["source_text"]
    assert source_text.mode == "summary"
    assert source_text.token_count > source_text.max_tokens == 1
    assert source_text.documents == []


@pytest.mark.asyncio
async def test_source_text_fetch_failure_keeps_the_summary_bundle(
    monkeypatch,
) -> None:
    """A reused source that cannot be re-read must not fail the whole build."""
    service, complete_build, run_id, upload_ids = _source_text_build(
        monkeypatch,
        fail_reused_fetch=True,
    )

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    completed = complete_build.await_args.kwargs
    assert [source.upload_id for source in completed["selected_sources"]] == upload_ids
    assert completed["source_text"].mode == "summary"
    assert completed["source_text"].documents == []


@pytest.mark.asyncio
async def test_refresh_rebuilds_only_when_the_city_inventory_changed(
    monkeypatch,
) -> None:
    from app.persistence.concept_notes.context_bundle import (
        ContextBundleRefreshState,
    )

    client = SimpleNamespace(close=AsyncMock())
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        cc_client_factory=lambda: client,  # type: ignore[arg-type,return-value]
    )
    inventory_id = str(uuid4())
    checked = {"inventory_id": inventory_id, "updated_at": "2026-09-01T10:00:00Z"}
    state = ContextBundleRefreshState(
        city_id=str(uuid4()),
        status="ready",
        selected_inventory_id=None,
        inventory_candidate=checked,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_refresh_state",
        AsyncMock(side_effect=lambda **_: state),
    )
    inventory = {"inventory_id": inventory_id, "updated_at": checked["updated_at"]}
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(side_effect=lambda **_: inventory),
    )
    queue = AsyncMock()
    monkeypatch.setattr(service, "_queue_rebuild", queue)

    assert await service.refresh_if_stale(
        user_id="owner", run_id=uuid4(), token="token"
    ) == "current"
    queue.assert_not_awaited()

    inventory = {"inventory_id": str(uuid4()), "year": 2024, "updated_at": None}
    assert await service.refresh_if_stale(
        user_id="owner", run_id=uuid4(), token="token"
    ) == "queued"
    queue.assert_awaited_once()

    state = ContextBundleRefreshState(
        city_id=state.city_id,
        status="building",
        selected_inventory_id=None,
        inventory_candidate=None,
    )
    assert await service.refresh_if_stale(
        user_id="owner", run_id=uuid4(), token="token"
    ) == "building"
    assert queue.await_count == 1

    # Drafting reads the context mid-run, so a changed inventory waits.
    state = replace(state, status="ready", draft_running=True)
    assert await service.refresh_if_stale(
        user_id="owner", run_id=uuid4(), token="token"
    ) == "current"
    assert queue.await_count == 1
