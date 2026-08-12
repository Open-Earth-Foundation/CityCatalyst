from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from app.models.cnb.context_bundle import SelectedSource, SourceExcerpt
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    normalize_bundle,
)
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.source_analysis import SourcePage

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[3]
FULL_CONTEXT_FIXTURE = (
    CLIMATE_ADVISOR_ROOT
    / "service"
    / "tests"
    / "fixtures"
    / "cnb"
    / "full_city_context_capabilities.json"
)
FULL_BUNDLE_EXAMPLE = (
    CLIMATE_ADVISOR_ROOT / "docs" / "examples" / "cc-513-full-context-bundle.json"
)
EXAMPLE_UPLOAD_ID = UUID("50000000-0000-4000-8000-000000000001")
EXAMPLE_MARKDOWN = (
    "<!-- page: 1 -->\n"
    "Sample City aims to cut community greenhouse gas emissions 50% by 2035.\n"
    "<!-- page: 2 -->\n"
    "The city will retrofit municipal buildings and expand heat-resilient green "
    "space."
)


class FakeRepository:
    """Capture service completion and failure writes."""

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


class FakeAnalysis:
    """Return a compact source after asserting immutable artifact checks."""

    def __init__(self) -> None:
        self.closed = False

    def verify_artifact(self, *, artifact, markdown_s3_key, sha256, page_count):
        assert artifact.markdown_s3_key == markdown_s3_key
        assert artifact.sha256 == sha256
        assert artifact.page_count == page_count
        return [SourcePage(number=1, text="\nCity evidence")]

    async def analyze_document(self, **kwargs):
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

    async def close(self):
        self.closed = True


class FakeCityCatalystClient:
    """Serve one source artifact without providing optional city data."""

    def __init__(self, artifact: ConceptNoteMarkdownArtifact) -> None:
        self.artifact = artifact
        self.closed = False

    async def get_concept_note_markdown(self, **kwargs):
        return self.artifact

    async def close(self):
        self.closed = True


class FullBundleAnalysis(FakeAnalysis):
    """Return deterministic two-page evidence for the checked-in example."""

    def verify_artifact(self, *, artifact, markdown_s3_key, sha256, page_count):
        assert artifact.markdown_s3_key == markdown_s3_key
        assert artifact.sha256 == sha256
        assert artifact.page_count == page_count == 2
        return [
            SourcePage(
                number=1,
                text=(
                    "Sample City aims to cut community greenhouse gas emissions "
                    "50% by 2035."
                ),
            ),
            SourcePage(
                number=2,
                text=(
                    "The city will retrofit municipal buildings and expand "
                    "heat-resilient green space."
                ),
            ),
        ]

    async def analyze_document(self, **kwargs):
        return SelectedSource(
            upload_id=kwargs["upload_id"],
            source_label=kwargs["source_label"],
            filename=kwargs["filename"],
            sha256=kwargs["sha256"],
            page_count=2,
            summary=(
                "Sample City targets a 50% community emissions reduction by 2035 "
                "and prioritizes municipal retrofits and heat-resilient green space."
            ),
            topics=[
                "emissions reduction",
                "building retrofits",
                "heat resilience",
            ],
            key_excerpts=[
                SourceExcerpt(
                    text=(
                        "Sample City aims to cut community greenhouse gas emissions "
                        "50% by 2035."
                    ),
                    page=1,
                ),
                SourceExcerpt(
                    text=(
                        "The city will retrofit municipal buildings and expand "
                        "heat-resilient green space."
                    ),
                    page=2,
                ),
            ],
        )


class FullBundleCityCatalystClient(FakeCityCatalystClient):
    """Serve realistic local GHGI and HIAP capability fixtures."""

    def __init__(
        self,
        artifact: ConceptNoteMarkdownArtifact,
        fixtures: dict,
    ) -> None:
        super().__init__(artifact)
        self.fixtures = fixtures

    async def load_inventory_list_accessible(self, **kwargs):
        assert kwargs["request_payload"]["city_id"] == self.fixtures["city_id"]
        return self.fixtures["inventory_list_accessible"]

    async def load_inventory_status_overview(self, **kwargs):
        assert (
            kwargs["request_payload"]["inventory_id"] == self.fixtures["inventory_id"]
        )
        return self.fixtures["inventory_status_overview"]

    async def load_inventory_emissions_context(self, **kwargs):
        assert (
            kwargs["request_payload"]["inventory_id"] == self.fixtures["inventory_id"]
        )
        return self.fixtures["inventory_emissions_context"]

    async def load_hiap_context(self, **kwargs):
        assert kwargs["request_payload"]["language"] == "en"
        assert (
            kwargs["request_payload"]["inventory_id"] == self.fixtures["inventory_id"]
        )
        return self.fixtures["hiap_inventory_context"]


@pytest.mark.asyncio
async def test_full_build_matches_checked_in_bundle_example() -> None:
    fixtures = json.loads(FULL_CONTEXT_FIXTURE.read_text(encoding="utf-8"))
    expected_bundle = json.loads(FULL_BUNDLE_EXAMPLE.read_text(encoding="utf-8"))
    digest = hashlib.sha256(EXAMPLE_MARKDOWN.encode()).hexdigest()
    assert digest == expected_bundle["selected_sources"][0]["sha256"]

    run_id = UUID("20000000-0000-4000-8000-000000000001")
    completed_at = datetime(2026, 8, 12, tzinfo=UTC)
    upload = ConceptNoteUploadSnapshot(
        upload_id=EXAMPLE_UPLOAD_ID,
        run_id=run_id,
        user_id="owner",
        filename="sample-city-climate-action-plan.pdf",
        source_label="Sample City Climate Action Plan",
        markdown_s3_key="sample-city-climate-action-plan.md",
        markdown_sha256=digest,
        page_count=2,
        status="ready",
        error_code=None,
        received_at=completed_at,
        completed_at=completed_at,
    )
    snapshot = ContextBundleBuildSnapshot(
        run_id=run_id,
        city_id=fixtures["city_id"],
        build_id=UUID("60000000-0000-4000-8000-000000000001"),
        source_fingerprint="a" * 64,
        uploads=[upload],
        already_current=False,
    )
    repository = FakeRepository(snapshot)
    analysis = FullBundleAnalysis()
    client = FullBundleCityCatalystClient(
        ConceptNoteMarkdownArtifact(
            markdown=EXAMPLE_MARKDOWN,
            markdown_s3_key=upload.markdown_s3_key,
            sha256=digest,
            page_count=2,
        ),
        fixtures,
    )
    service = ContextBundleService(
        repository,  # type: ignore[arg-type]
        analysis_factory=lambda: analysis,  # type: ignore[arg-type]
        cc_client_factory=lambda: client,
    )

    assert (
        await service.build(
            user_id="owner",
            run_id=run_id,
            token="local-test-token",
        )
        is True
    )
    assert repository.completed is not None
    assert repository.completed["optional_sources"] == {
        "ghgi": "partial",
        "hiap": "available",
    }
    assert repository.completed["warnings"] == []

    actual_bundle = normalize_bundle(
        {
            "selected_sources": repository.completed["selected_sources"],
            "cc_context": {
                "ghgi": repository.completed["ghgi"],
                "hiap": repository.completed["hiap"],
            },
        }
    ).model_dump(mode="json")
    assert actual_bundle == expected_bundle
    assert analysis.closed is True
    assert client.closed is True


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
        source_fingerprint="a" * 64,
        uploads=[upload],
        already_current=False,
    )
    repository = FakeRepository(snapshot)
    analysis = FakeAnalysis()
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
    service = ContextBundleService(
        repository,  # type: ignore[arg-type]
        analysis_factory=lambda: analysis,  # type: ignore[arg-type]
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
    assert repository.failed is None
    assert repository.completed is not None
    assert repository.completed["ghgi"] is None
    assert repository.completed["hiap"] is None
    assert repository.completed["optional_sources"] == {
        "ghgi": "missing",
        "hiap": "missing",
    }
    assert [item.upload_id for item in repository.completed["selected_sources"]] == [
        upload_id
    ]
    assert analysis.closed is True
    assert client.closed is True


@pytest.mark.asyncio
async def test_partial_ghgi_and_usable_hiap_are_retained(monkeypatch) -> None:
    snapshot = ContextBundleBuildSnapshot(
        run_id=uuid4(),
        city_id=str(uuid4()),
        build_id=uuid4(),
        source_fingerprint="a" * 64,
        uploads=[],
        already_current=False,
    )
    service = ContextBundleService(FakeRepository(snapshot))  # type: ignore[arg-type]
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
    snapshot = ContextBundleBuildSnapshot(
        run_id=uuid4(),
        city_id=str(uuid4()),
        build_id=uuid4(),
        source_fingerprint="a" * 64,
        uploads=[],
        already_current=False,
    )
    service = ContextBundleService(FakeRepository(snapshot))  # type: ignore[arg-type]

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
