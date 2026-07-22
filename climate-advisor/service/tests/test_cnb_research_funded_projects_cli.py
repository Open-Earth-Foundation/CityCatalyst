"""Tests for funded-project research manifest loading and batch orchestration."""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys
from types import SimpleNamespace
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.models.cnb_research import (
    CanonicalFunder,
    FunderDraft,
    FunderProfileDraft,
    FundingOpportunityResearchBundle,
    FundingRecordDraft,
    ResearchRunMetadata,
    ReviewState,
)
from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest
from app.services.cnb_funder_identity_match import propose_funder_identity_candidates
from tests.cnb_research_helpers import build_request

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]
if str(CLIMATE_ADVISOR_ROOT) not in sys.path:
    sys.path.insert(0, str(CLIMATE_ADVISOR_ROOT))

from scripts.cnb_research import research_funded_projects  # noqa: E402


class FakeRecord:
    """Small model-like object used to verify review artifact writing."""

    def __init__(self, name: str) -> None:
        self.name = name

    def model_dump(self, *, mode: str) -> dict[str, str]:
        assert mode == "json"
        return {"name": self.name}


class FakeBundle:
    """Small bundle-like object that preserves the script's write contract."""

    def __init__(self, run_id: str, funder_name: str = "Example Funder") -> None:
        self.run_id = run_id
        self.request = SimpleNamespace(funder_name=funder_name)
        self.funder = SimpleNamespace(name=funder_name)
        self.funding_records = [FakeRecord("raw")]

    def model_dump(self, *, mode: str) -> dict[str, object]:
        assert mode == "json"
        return {
            "run_id": self.run_id,
            "funder": {"name": self.funder.name},
            "funding_records": [record.model_dump(mode=mode) for record in self.funding_records],
        }


def build_target_project() -> CnbSimilarProjectSearchRequest:
    """Build the required project-first discovery context for CLI tests."""
    return CnbSimilarProjectSearchRequest(
        run_id=UUID("eee75fe1-30e7-5fc1-9bf8-d2a72fca00dd"),
        funder_scope="cross_funder",
        project_name="Nicosia municipal solar, storage, and mobility project",
        project_summary=(
            "Municipal photovoltaic generation, battery storage, and electric "
            "mobility infrastructure in Nicosia."
        ),
        category="Renewable energy and sustainable urban mobility",
        sector="Municipal energy and transport",
        country="Cyprus",
        interventions=[
            "Solar photovoltaic systems on municipality-owned buildings",
            "Battery storage integrated with municipal solar generation",
        ],
        project_tags=["municipal-solar", "battery-storage"],
        limit=50,
    )


def build_research_bundle(
    *,
    reported_funder_name: str | None,
) -> FundingOpportunityResearchBundle:
    """Build a bundle for artifact-level canonical-funder enrichment tests."""
    now = datetime.now(timezone.utc)
    request = build_request(max_turns=1).model_copy(
        update={
            "funder_name": "ELENA",
            "target_project": build_target_project(),
        }
    )
    return FundingOpportunityResearchBundle(
        schema_version="2.0",
        run_id="run-1",
        run_metadata=ResearchRunMetadata(
            pipeline_version="2.0",
            model_name="test-model",
            reasoning_effort="medium",
            prompt_sha256="prompt-hash",
            started_at=now,
            completed_at=now,
            duration_seconds=1,
            max_turns=1,
            turns_used=1,
            termination_reason="coverage_complete",
        ),
        request=request,
        funder=FunderDraft(
            funder_ref="funder-001",
            name="European Local Energy Assistance",
            profile=FunderProfileDraft(),
        ),
        funding_records=[
            FundingRecordDraft(
                funding_record_ref="opportunity-001",
                funder_ref="funder-001",
                is_opportunity=True,
                name="Example Program",
            ),
            FundingRecordDraft(
                funding_record_ref="project-001",
                funder_ref="funder-001",
                is_opportunity=False,
                name="Evidence-backed project",
                reported_funder_name=reported_funder_name,
            ),
        ],
        review=ReviewState(status="pending_review"),
    )


def test_parse_args_requires_project(monkeypatch: pytest.MonkeyPatch) -> None:
    """The CLI must reject discovery commands without a target project."""
    monkeypatch.setattr(
        sys,
        "argv",
        ["research_funded_projects", "--input", "request.json"],
    )

    with pytest.raises(SystemExit) as exc_info:
        research_funded_projects.parse_args()

    assert exc_info.value.code == 2


def test_parse_args_allows_funders_to_be_omitted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Canonical funders should be an optional post-discovery enrichment input."""
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "research_funded_projects",
            "--input",
            "request.json",
            "--project",
            "project.json",
        ],
    )

    args = research_funded_projects.parse_args()

    assert args.project == Path("project.json")
    assert args.funders is None
    assert args.request_index is None


def test_parse_args_accepts_batch_request_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A batch retry should accept a 1-based request position."""
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "research_funded_projects",
            "--input",
            "batch.json",
            "--project",
            "project.json",
            "--request-index",
            "3",
        ],
    )

    args = research_funded_projects.parse_args()

    assert args.request_index == 3


def test_load_target_project_validates_project_profile(tmp_path: Path) -> None:
    """The target project should use the shared similar-project request model."""
    target_project = build_target_project()
    project_path = tmp_path / "project.json"
    project_path.write_text(
        target_project.model_dump_json(indent=2),
        encoding="utf-8",
    )

    loaded = research_funded_projects.load_target_project(project_path)

    assert loaded == target_project


def test_load_request_accepts_single_request_manifest(tmp_path: Path) -> None:
    """A single programme request should receive the required target project."""
    request = build_request()
    target_project = build_target_project()
    request_path = tmp_path / "request.json"
    request_path.write_text(
        request.model_dump_json(indent=2),
        encoding="utf-8",
    )

    loaded = research_funded_projects.load_request(
        request_path,
        target_project=target_project,
    )

    assert loaded == request.model_copy(update={"target_project": target_project})
    assert loaded.target_project == target_project


def test_load_request_accepts_strict_batch_manifest(tmp_path: Path) -> None:
    """Batch inputs should validate each request and retain the batch name."""
    first = build_request()
    target_project = build_target_project()
    second = type(first).model_validate(
        {
            **first.model_dump(mode="json"),
            "funder_name": "Second Funder",
            "program_name": "Second Program",
            "program_url": "https://funder.example/second-program",
        }
    )
    batch_path = tmp_path / "batch.json"
    batch_path.write_text(
        json.dumps(
            {
                "batch_name": "Minnesota awards",
                "requests": [
                    first.model_dump(mode="json"),
                    second.model_dump(mode="json"),
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    loaded = research_funded_projects.load_request(
        batch_path,
        target_project=target_project,
    )

    assert loaded.batch_name == "Minnesota awards"
    assert list(loaded.requests) == [
        first.model_copy(update={"target_project": target_project}),
        second.model_copy(update={"target_project": target_project}),
    ]
    assert all(
        request.target_project == target_project for request in loaded.requests
    )


def test_load_request_rejects_empty_batch_manifest(tmp_path: Path) -> None:
    """Batch inputs must contain at least one research request."""
    batch_path = tmp_path / "batch.json"
    batch_path.write_text(
        '{\n  "batch_name": "Empty batch",\n  "requests": []\n}\n',
        encoding="utf-8",
    )

    with pytest.raises(ValidationError) as exc_info:
        research_funded_projects.load_request(
            batch_path,
            target_project=build_target_project(),
        )

    assert "requests" in str(exc_info.value)


def test_main_uses_no_funder_candidates_when_snapshot_is_omitted(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Discovery without --funders should pass an empty canonical-funder list."""
    target_project = build_target_project()
    request = build_request().model_copy(
        update={"target_project": target_project}
    )
    monkeypatch.setattr(
        research_funded_projects,
        "parse_args",
        lambda: SimpleNamespace(
            input=tmp_path / "request.json",
            project=tmp_path / "project.json",
            funders=None,
            request_index=None,
            output=tmp_path / "output",
            log_level="INFO",
        ),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_target_project",
        lambda path: target_project,
    )

    def fake_load_request(
        path: Path,
        *,
        target_project: CnbSimilarProjectSearchRequest,
    ):
        assert path == tmp_path / "request.json"
        assert target_project == build_target_project()
        return request

    monkeypatch.setattr(
        research_funded_projects,
        "load_request",
        fake_load_request,
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_canonical_funders",
        lambda path: pytest.fail("optional funder snapshot should not be loaded"),
    )
    observed_funders: list[object] | None = None

    def fake_execute_research_request(**kwargs):
        nonlocal observed_funders
        observed_funders = kwargs["canonical_funders"]
        assert kwargs["request"].target_project == target_project
        return research_funded_projects.ResearchArtifactRecord(
            run_id="run-1",
            research_path=tmp_path / "run-1.research.json",
        )

    monkeypatch.setattr(
        research_funded_projects,
        "execute_research_request",
        fake_execute_research_request,
    )

    research_funded_projects.main()

    assert observed_funders == []


def test_main_rejects_request_index_for_single_manifest(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """The batch-only selector must fail before any provider research starts."""
    target_project = build_target_project()
    request = build_request().model_copy(
        update={"target_project": target_project}
    )
    monkeypatch.setattr(
        research_funded_projects,
        "parse_args",
        lambda: SimpleNamespace(
            input=tmp_path / "request.json",
            project=tmp_path / "project.json",
            funders=None,
            request_index=1,
            output=tmp_path / "output",
            log_level="INFO",
        ),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_target_project",
        lambda path: target_project,
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_request",
        lambda path, *, target_project: request,
    )

    with pytest.raises(SystemExit) as exc_info:
        research_funded_projects.main()

    assert exc_info.value.code == 2
    assert str(exc_info.value.__cause__) == (
        "--request-index is valid only when --input is a batch manifest."
    )


@pytest.mark.parametrize("request_index", [0, 3])
def test_main_rejects_request_index_outside_batch_range(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    request_index: int,
) -> None:
    """The selector must reject positions outside the validated batch."""
    target_project = build_target_project()
    batch = research_funded_projects.ResearchBatchInput(
        batch_name="Two programs",
        requests=(build_request(), build_request()),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "parse_args",
        lambda: SimpleNamespace(
            input=tmp_path / "batch.json",
            project=tmp_path / "project.json",
            funders=None,
            request_index=request_index,
            output=tmp_path / "output",
            log_level="INFO",
        ),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_target_project",
        lambda path: target_project,
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_request",
        lambda path, *, target_project: batch,
    )

    with pytest.raises(SystemExit) as exc_info:
        research_funded_projects.main()

    assert exc_info.value.code == 2
    assert str(exc_info.value.__cause__) == (
        f"--request-index must be between 1 and 2 for this batch; got {request_index}."
    )


def test_main_runs_selected_batch_request_without_rewriting_index(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A selected retry should use the single-run path and preserve the index."""
    target_project = build_target_project()
    first = build_request()
    second = first.model_copy(
        update={
            "funder_name": "Second Funder",
            "program_name": "Second Program",
        }
    )
    batch = research_funded_projects.ResearchBatchInput(
        batch_name="Two programs",
        requests=(first, second),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "parse_args",
        lambda: SimpleNamespace(
            input=tmp_path / "batch.json",
            project=tmp_path / "project.json",
            funders=None,
            request_index=2,
            output=tmp_path / "output",
            log_level="INFO",
        ),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_target_project",
        lambda path: target_project,
    )
    monkeypatch.setattr(
        research_funded_projects,
        "load_request",
        lambda path, *, target_project: batch,
    )
    monkeypatch.setattr(
        research_funded_projects,
        "run_batch_research",
        lambda **kwargs: pytest.fail("selected retry must not use the batch path"),
    )
    monkeypatch.setattr(
        research_funded_projects,
        "write_batch_index_artifact",
        lambda **kwargs: pytest.fail("selected retry must preserve the batch index"),
    )
    observed_request: object | None = None

    def fake_execute_research_request(**kwargs):
        nonlocal observed_request
        observed_request = kwargs["request"]
        assert kwargs["canonical_funders"] == []
        return research_funded_projects.ResearchArtifactRecord(
            run_id="selected-run",
            research_path=tmp_path / "selected-run.research.json",
        )

    monkeypatch.setattr(
        research_funded_projects,
        "execute_research_request",
        fake_execute_research_request,
    )

    with caplog.at_level(logging.INFO, logger=research_funded_projects.__name__):
        research_funded_projects.main()

    assert observed_request == second
    assert "Running selected funded-project batch request 2/2" in caplog.text
    assert "the full batch index will not be rewritten" in caplog.text


def test_run_batch_research_writes_index_with_run_ids_and_paths(tmp_path: Path) -> None:
    """Batch orchestration should reuse single-run behavior and add only an index."""
    batch = research_funded_projects.ResearchBatchInput(
        batch_name="Minnesota awards",
        requests=(build_request(), build_request()),
    )
    output_root = tmp_path / "output"
    observed_programs: list[str] = []

    def fake_run_research(request, *, output_root: Path) -> FakeBundle:
        run_id = f"run-{len(observed_programs) + 1}"
        observed_programs.append(request.program_name)
        run_directory = output_root / run_id
        run_directory.mkdir(parents=True, exist_ok=False)
        return FakeBundle(run_id)

    def fake_propose_candidates(
        *, funding_records, canonical_funders, dossier_funder_name
    ):
        assert canonical_funders == ["canonical"]
        assert dossier_funder_name == "Example Funder"
        assert funding_records
        return [FakeRecord("review-ready")]

    artifacts = research_funded_projects.run_batch_research(
        batch=batch,
        output_root=output_root,
        canonical_funders=["canonical"],
        run_research=fake_run_research,
        propose_candidates=fake_propose_candidates,
    )
    batch_index_path = research_funded_projects.write_batch_index_artifact(
        output_root=output_root,
        batch_name=batch.batch_name,
        artifacts=artifacts,
    )

    assert observed_programs == ["Example Program", "Example Program"]
    assert [artifact.run_id for artifact in artifacts] == ["run-1", "run-2"]
    assert batch_index_path.name == "minnesota-awards.batch.json"
    assert (output_root / "run-1" / "run-1.research.json").exists()
    assert (output_root / "run-2" / "run-2.research.json").exists()
    assert json.loads(batch_index_path.read_text(encoding="utf-8")) == {
        "batch_name": "Minnesota awards",
        "runs": [
            {
                "run_id": "run-1",
                "research_path": str(
                    (output_root / "run-1" / "run-1.research.json").resolve()
                ),
            },
            {
                "run_id": "run-2",
                "research_path": str(
                    (output_root / "run-2" / "run-2.research.json").resolve()
                ),
            },
        ],
    }


def test_rewrite_research_artifact_from_bundle_reenriches_without_research(
    tmp_path: Path,
) -> None:
    """An artifact can be repaired from its validated bundle without a provider."""
    bundle = build_research_bundle(reported_funder_name=None)
    canonical_funders = [
        CanonicalFunder(
            funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
            name="ELENA",
        )
    ]
    research_path = tmp_path / "run-1.research.json"
    research_path.write_text('{"stale": true}\n', encoding="utf-8")

    artifact = research_funded_projects.rewrite_research_artifact_from_bundle(
        bundle=bundle,
        research_path=research_path,
        canonical_funders=canonical_funders,
        propose_candidates=propose_funder_identity_candidates,
    )

    assert artifact == research_funded_projects.ResearchArtifactRecord(
        run_id="run-1",
        research_path=research_path,
    )
    rewritten_payload = json.loads(research_path.read_text(encoding="utf-8"))
    assert rewritten_payload["funder"]["name"] == "European Local Energy Assistance"
    rewritten_project = next(
        record
        for record in rewritten_payload["funding_records"]
        if not record["is_opportunity"]
    )
    assert rewritten_project["reported_funder_name"] is None
    assert rewritten_project["candidate_funders"] == [
        {
            "funder_id": "7eb0df43-db16-4eb7-88f9-92b5884b617f",
            "name": "ELENA",
            "match_reason": "Exact dossier-funder name match",
        }
    ]


def test_rewrite_without_funder_snapshot_preserves_reported_funder_name(
    tmp_path: Path,
) -> None:
    """No snapshot should preserve research facts without inventing identities."""
    research_path = tmp_path / "run-1.research.json"
    bundle = build_research_bundle(
        reported_funder_name="European Investment Bank",
    )

    research_funded_projects.rewrite_research_artifact_from_bundle(
        bundle=bundle,
        research_path=research_path,
        canonical_funders=[],
        propose_candidates=propose_funder_identity_candidates,
    )

    rewritten_payload = json.loads(research_path.read_text(encoding="utf-8"))
    rewritten_project = next(
        record
        for record in rewritten_payload["funding_records"]
        if not record["is_opportunity"]
    )
    assert rewritten_project["reported_funder_name"] == "European Investment Bank"
    assert rewritten_project["candidate_funders"] == []
    assert rewritten_project["selected_funder_id"] is None
