from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.config import get_settings
from app.models.cnb.context_bundle import SelectedSource
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import (
    ContextBundleService,
    run_context_bundle_reconciler,
)
from app.services.cnb.source_analysis import (
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

    with pytest.raises(asyncio.CancelledError):
        await run_context_bundle_reconciler(
            interval_seconds=1,
            stale_after=timedelta(hours=1),
        )

    recover_stale_builds.assert_awaited_once()
    assert recover_stale_builds.await_args.kwargs["session_factory"] is session_factory


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
    assert completed["ghgi"] is None
    assert completed["hiap"] is None
    assert completed["optional_sources"] == {
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
    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(
            return_value=ConceptNoteMarkdownArtifact(
                markdown=new_markdown,
                markdown_s3_key=f"{new_upload_id}.md",
                sha256=new_digest,
                source_format="pdf",
                page_count=1,
            )
        ),
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

    analyze.assert_awaited_once()
    assert analyze.await_args.kwargs["upload_id"] == new_upload_id
    client.get_concept_note_markdown.assert_awaited_once_with(
        upload_id=str(new_upload_id),
        token="token",
    )
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
    assert completed["optional_sources"] == {
        "ghgi": "missing",
        "hiap": "missing",
    }
    assert completed["warnings"] == [
        "No source document is attached; responses use limited context until a source is added."
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
    ghgi, hiap, statuses, warnings = await service._load_optional_context(
        user_id="owner",
        city_id=uuid4(),
        token="token",
        cc_client=SimpleNamespace(),  # type: ignore[arg-type]
    )
    assert ghgi == {"availability": "partial", "emissions": {}}
    assert hiap == {"availability": "available", "actions": [1]}
    assert statuses == {"ghgi": "partial", "hiap": "available"}
    assert warnings == []


@pytest.mark.asyncio
async def test_optional_source_errors_do_not_fail_source_readiness(monkeypatch) -> None:
    service = ContextBundleService(None)  # type: ignore[arg-type]

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(side_effect=RuntimeError("optional service unavailable")),
    )
    ghgi, hiap, statuses, warnings = await service._load_optional_context(
        user_id="owner",
        city_id=uuid4(),
        token="token",
        cc_client=SimpleNamespace(),  # type: ignore[arg-type]
    )
    assert ghgi is None and hiap is None
    assert statuses == {"ghgi": "unavailable", "hiap": "unavailable"}
    assert warnings
