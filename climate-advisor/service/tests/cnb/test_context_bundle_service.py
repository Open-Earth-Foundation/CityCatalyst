from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
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


class PersistenceRecorder:
    """Capture context-bundle persistence calls made by the service."""

    def __init__(self, snapshot: ContextBundleBuildSnapshot) -> None:
        self.snapshot = snapshot
        self.completed: dict | None = None
        self.failed: dict | None = None

    async def begin_build(self, **kwargs):
        return self.snapshot

    async def complete_build(self, **kwargs):
        self.completed = kwargs
        return True

    async def fail_build(self, **kwargs):
        self.failed = kwargs
        return True


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


class FakeCityCatalystClient:
    """Serve one source artifact without providing optional city data."""

    def __init__(self, artifact: ConceptNoteMarkdownArtifact) -> None:
        self.artifact = artifact
        self.closed = False

    async def get_concept_note_markdown(self, **kwargs):
        return self.artifact

    async def close(self):
        self.closed = True


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
    persistence = PersistenceRecorder(snapshot)
    client = FakeCityCatalystClient(
        ConceptNoteMarkdownArtifact(
            markdown=markdown,
            markdown_s3_key="result.md",
            sha256=digest,
            page_count=1,
        )
    )

    async def no_inventory(**kwargs):
        return None

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        no_inventory,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        persistence.begin_build,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.complete_build",
        persistence.complete_build,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.fail_build",
        persistence.fail_build,
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
    assert persistence.failed is None
    assert persistence.completed is not None
    assert persistence.completed["ghgi"] is None
    assert persistence.completed["hiap"] is None
    assert persistence.completed["optional_sources"] == {
        "ghgi": "missing",
        "hiap": "missing",
    }
    assert [item.upload_id for item in persistence.completed["selected_sources"]] == [
        upload_id
    ]
    assert client.closed is True


@pytest.mark.asyncio
async def test_partial_ghgi_and_usable_hiap_are_retained(monkeypatch) -> None:
    service = ContextBundleService(None)  # type: ignore[arg-type]
    inventory = {"inventory_id": str(uuid4())}

    async def inventory_loader(**kwargs):
        return inventory

    async def ghgi_loader(**kwargs):
        return SimpleNamespace(
            availability="partial",
            model_dump=lambda **_: {"availability": "partial", "emissions": {}},
        )

    actions = [SimpleNamespace(action_id="action-1")]

    async def hiap_loader(**kwargs):
        return SimpleNamespace(
            availability="available",
            mitigation=SimpleNamespace(actions=actions),
            adaptation=SimpleNamespace(actions=[]),
            model_dump=lambda **_: {"availability": "available", "actions": [1]},
        )

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        inventory_loader,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_ghgi_context",
        ghgi_loader,
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_hiap_context",
        hiap_loader,
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

    async def unavailable(**kwargs):
        raise RuntimeError("optional service unavailable")

    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        unavailable,
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
