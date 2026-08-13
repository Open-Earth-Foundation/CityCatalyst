from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.models.cnb.context_bundle import ConceptNoteContextBundle, SelectedSource
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.source_analysis import SourcePage

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[3]
FULL_BUNDLE_EXAMPLE = (
    CLIMATE_ADVISOR_ROOT / "docs" / "examples" / "cc-513-full-context-bundle.json"
)


def fake_verify_source_artifact(
    *, artifact, markdown_s3_key, sha256, page_count
) -> list[SourcePage]:
    """Return one page after asserting immutable artifact checks."""
    assert artifact.markdown_s3_key == markdown_s3_key
    assert artifact.sha256 == sha256
    assert artifact.page_count == page_count
    return [SourcePage(number=1, text="\nCity evidence")]


async def fake_analyze_document(**kwargs) -> SelectedSource:
    """Return compact source context without running an LLM."""
    return SelectedSource(
        upload_id=kwargs["upload_id"],
        source_label=kwargs["source_label"] or kwargs["filename"],
        filename=kwargs["filename"],
        sha256=kwargs["sha256"],
        page_count=1,
        summary="City evidence summary.",
        topics=["city"],
        key_excerpts=[],
    )


def test_checked_in_full_stack_bundle_example_matches_contract() -> None:
    exported_bundle = json.loads(FULL_BUNDLE_EXAMPLE.read_text(encoding="utf-8"))

    bundle = ConceptNoteContextBundle.model_validate(exported_bundle)

    assert len(bundle.selected_sources) == 1
    assert bundle.cc_context.ghgi is not None
    assert bundle.cc_context.ghgi["availability"] == "partial"
    assert bundle.cc_context.hiap is not None
    assert bundle.cc_context.hiap["availability"] == "available"
    assert bundle.funder_context is None
    assert bundle.similar_projects == []
    assert bundle.document_context is None


@pytest.mark.asyncio
async def test_pdf_only_build_completes_with_null_optional_sources(monkeypatch) -> None:
    markdown = "<!-- page: 1 -->\nCity evidence"
    digest = hashlib.sha256(markdown.encode()).hexdigest()
    run_id = uuid4()
    upload_id = uuid4()
    upload = ConceptNoteUploadSnapshot(
        upload_id=upload_id,
        run_id=run_id,
        user_id="owner",
        filename="city.pdf",
        source_label="City plan",
        markdown_s3_key="result.md",
        markdown_sha256=digest,
        page_count=1,
        status="ready",
        error_code=None,
        received_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
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
    assert [item.upload_id for item in completed["selected_sources"]] == [
        upload_id
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
async def test_optional_source_errors_do_not_fail_pdf_readiness(monkeypatch) -> None:
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
