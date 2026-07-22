"""
Brief: Run one provider-backed similar-project match for local human review.

Inputs:
- CLI args:
  - ``--input``: JSON matching ``CnbSimilarProjectReviewRunInput``. The
    request represents current-project fields that have already been extracted
    from an ingested upload; candidates represent reviewed reference data.
  - ``--search-request`` with ``--funders`` and paired ``--research`` and
    ``--review`` paths:
    the request is one ``CnbSimilarProjectSearchRequest`` JSON document, and
    each ordered research/review pair is converted into one or more validated
    ``CnbSimilarProjectCandidate`` records from approved funded-project review
    data. ``--funders`` must point to the canonical-funder snapshot used for
    identity review; selected funder UUIDs absent from that snapshot are
    rejected. This mode keeps the existing current-project search request
    while replacing hand-authored candidate snapshots with deterministic local
    candidates derived from reviewed reference artifacts.
  - ``--output``: Parent directory for the per-run review artifact; defaults
    to ``output/cnb_research``.
  - ``--source-bundle``: Optional path recorded as provenance for a local
    ``--input`` snapshot. The file is not parsed or modified by this command.
  - ``--log-level``: Python logging level; defaults to ``INFO``.
- Env vars: ``OPENAI_API_KEY`` is loaded from the Climate Advisor ``.env`` and
  used with the model, reasoning effort, API base URL, and prompt configured in
  ``llm_config.yaml``. Its value is never written to an artifact or log, and
  provider-side response storage is disabled for this local harness.

Outputs:
- Creates ``<output>/<run_id>/<run_id>.similar-projects.json`` for the shared
  static review website.
- Creates ``<output>/<run_id>/<run_id>.similar-projects.input.json`` containing
  the validated, normalized local input for reproducibility.
- Records the resolved canonical-funder, research, and review artifact paths
  in reviewed-pair run metadata.
- Performs no database or CityCatalyst writes. The in-memory workflow store
  deliberately models the post-ingestion boundary declared by the input; this
  command is a local review harness, not the production workflow adapter.

Usage (from ``climate-advisor/``):
- ``uv run python -m scripts.cnb_research.run_similar_project_matching \
    --input path/to/similar-project-input.json \
    --source-bundle output/cnb_research/<source-run>/research_bundle.json \
    --output output/cnb_research``
- ``uv run python -m scripts.cnb_research.run_similar_project_matching \
    --search-request path/to/search-request.json \
    --funders path/to/canonical-funders.json \
    --research path/to/research-a.json --review path/to/review-a.json \
    --research path/to/research-b.json --review path/to/review-b.json \
    --output output/cnb_research``
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import logging
from pathlib import Path
import sys
from typing import Any
from uuid import UUID, uuid5

from pydantic import ValidationError

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path("output/cnb_research")
LOCAL_REVIEW_ID_NAMESPACE = UUID("a5321519-d7fb-4ac3-b8c1-68c8f667eb2f")


class LocalReviewWorkflowStore:
    """Capture local persistence calls after the input's ingestion boundary."""

    def __init__(self) -> None:
        """Initialize an empty in-memory result and context section."""
        self.matches: list[Any] = []
        self.context_bundle: dict[str, Any] = {}
        self.caveats: list[str] = []

    def has_ingested_project_upload(self, *, run_id: UUID) -> bool:
        """Treat the validated local request as explicitly post-ingestion."""
        return True

    def replace_selected_similar_project_matches(
        self,
        *,
        run_id: UUID,
        matches: list[Any],
    ) -> None:
        """Capture the matches the production store would replace atomically."""
        self.matches = list(matches)

    def rebuild_similar_projects_context(
        self,
        *,
        run_id: UUID,
        matches: list[Any],
        caveats: list[str],
    ) -> None:
        """Capture the rebuilt internal section without writing external state."""
        self.matches = list(matches)
        self.caveats = list(caveats)
        self.context_bundle = {
            "similar_projects": [
                match.model_dump(mode="json") for match in matches
            ],
            "similar_project_caveats": list(caveats),
        }


class LocalReviewReferenceDataClient:
    """Serve the caller-supplied reviewed candidates through the typed protocol."""

    def __init__(self, candidates: list[Any]) -> None:
        """Retain a defensive copy of the local review snapshot."""
        self.candidates = list(candidates)

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
        limit: int,
    ) -> list[Any]:
        """Return a bounded all-funder or same-funder candidate view."""
        candidates = self.candidates
        if funder_id is not None:
            candidates = [
                candidate
                for candidate in candidates
                if candidate.funder_id == funder_id
            ]
        return candidates[:limit]


def parse_args() -> argparse.Namespace:
    """Parse local matching input, output, provenance, and logging options."""
    parser = argparse.ArgumentParser(
        description=(
            "Run configured CNB similar-project matching and write a local "
            "human-review artifact."
        )
    )
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--input",
        type=Path,
        help="Path to a CnbSimilarProjectReviewRunInput JSON document.",
    )
    input_group.add_argument(
        "--search-request",
        type=Path,
        help=(
            "Path to a CnbSimilarProjectSearchRequest JSON document used with "
            "paired --research/--review artifacts."
        ),
    )
    parser.add_argument(
        "--funders",
        type=Path,
        default=None,
        help=(
            "Path to the canonical-funder snapshot required with "
            "--search-request."
        ),
    )
    parser.add_argument(
        "--research",
        type=Path,
        action="append",
        default=[],
        help=(
            "Path to one FundingOpportunityResearchBundle JSON artifact. "
            "Repeat in the same order as --review."
        ),
    )
    parser.add_argument(
        "--review",
        type=Path,
        action="append",
        default=[],
        help=(
            "Path to one ReviewedReferenceDataArtifact JSON artifact. "
            "Repeat in the same order as --research."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=(
            "Parent directory for per-run artifacts "
            "(default: output/cnb_research)."
        ),
    )
    parser.add_argument(
        "--source-bundle",
        type=Path,
        default=None,
        help=(
            "Optional source research bundle path recorded for --input mode "
            "only."
        ),
    )
    parser.add_argument(
        "--log-level",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        default="INFO",
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args()


def ensure_service_directory_on_path() -> None:
    """Expose the Climate Advisor service package for this CLI process only."""
    service_directory = Path(__file__).resolve().parents[2] / "service"
    if str(service_directory) not in sys.path:
        sys.path.insert(0, str(service_directory))


def load_run_input(path: Path) -> Any:
    """Read and strictly validate one local review input document."""
    from app.models.cnb_similar_projects import CnbSimilarProjectReviewRunInput

    payload = json.loads(path.read_text(encoding="utf-8"))
    return CnbSimilarProjectReviewRunInput.model_validate(payload)


def load_search_request(path: Path) -> Any:
    """Read and strictly validate one local similar-project search request."""
    from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest

    payload = json.loads(path.read_text(encoding="utf-8"))
    return CnbSimilarProjectSearchRequest.model_validate(payload)


def load_research_bundle(path: Path) -> Any:
    """Read and strictly validate one local funding research bundle."""
    from app.models.cnb_research import FundingOpportunityResearchBundle

    payload = json.loads(path.read_text(encoding="utf-8"))
    return FundingOpportunityResearchBundle.model_validate(payload)


def load_review_artifact(path: Path) -> Any:
    """Read and strictly validate one reviewed reference-data artifact."""
    from app.services.cnb_review_import import ReviewedReferenceDataArtifact

    payload = json.loads(path.read_text(encoding="utf-8"))
    return ReviewedReferenceDataArtifact.model_validate(payload)


def _normalize_text(value: str | None) -> str:
    """Normalize optional text for deterministic deduplication keys."""
    return (value or "").strip().casefold()


def _normalize_decimal(value: Decimal | None) -> str:
    """Render decimals deterministically without preserving trailing zeros."""
    if value is None:
        return ""
    text = format(value, "f")
    if "." not in text:
        return text
    return text.rstrip("0").rstrip(".")


def _humanize_gap_field(target_path: str, funding_record_ref: str) -> str | None:
    """Return a simple field label for one project-scoped gap path."""
    prefix = f"funding_records[{funding_record_ref}]"
    if not target_path.startswith(f"{prefix}."):
        return None
    field_path = target_path[len(prefix) + 1 :]
    if not field_path:
        return None
    field_tokens = [
        token.replace("_", " ").strip()
        for token in field_path.split(".")
        if token.strip()
    ]
    if not field_tokens:
        return None
    return " ".join(field_tokens).title()


def _record_gap_texts(research: Any, funding_record_ref: str) -> list[str]:
    """Retain project-scoped gap reasons as prompt-facing caveat text."""
    prefix = f"funding_records[{funding_record_ref}]"
    gap_texts: list[str] = []
    seen: set[str] = set()
    for gap in research.gaps:
        if gap.target_path != prefix and not gap.target_path.startswith(f"{prefix}."):
            continue
        label = _humanize_gap_field(gap.target_path, funding_record_ref)
        gap_text = (
            f"{label}: {gap.reason}"
            if label is not None
            else gap.reason
        )
        if gap_text in seen:
            continue
        seen.add(gap_text)
        gap_texts.append(gap_text)
    return gap_texts


def _candidate_funder_name(record: Any) -> str | None:
    """Return the reviewed canonical funder name for one funded project."""
    if record.selected_funder_id is None:
        return record.reported_funder_name
    for candidate in record.candidate_funders:
        if candidate.funder_id == record.selected_funder_id:
            return candidate.name
    return record.reported_funder_name


def _local_source_ref(*, run_id: str, source_ref: str) -> str:
    """Namespace reviewed source identities so merged snapshots stay unique."""
    return f"{run_id}:{source_ref}"


def _local_evidence_ref(*, run_id: str, evidence_ref: str) -> str:
    """Namespace reviewed evidence identities across paired review runs."""
    return f"{run_id}:{evidence_ref}"


def _candidate_identity_key(record: Any) -> str:
    """Build the semantic key used for local reviewed-project deduplication."""
    return "|".join(
        (
            str(record.selected_funder_id),
            _normalize_text(record.name),
            _normalize_text(record.applicant_name),
            _normalize_text(record.city),
            _normalize_text(record.state_region),
            _normalize_text(record.country),
            str(record.award_year or ""),
            _normalize_decimal(record.award_amount),
            _normalize_text(record.currency),
        )
    )


def _candidate_funding_record_id(record: Any) -> UUID:
    """Derive one deterministic local UUID from the semantic candidate key."""
    return uuid5(
        LOCAL_REVIEW_ID_NAMESPACE,
        _candidate_identity_key(record),
    )


def _candidate_scalar_score(candidate: Any) -> int:
    """Prefer the candidate carrying the richest reviewed scalar coverage."""
    scalar_values = (
        candidate.funder_name,
        candidate.award_status,
        candidate.award_amount,
        candidate.currency,
        candidate.award_year,
        candidate.name,
        candidate.applicant_name,
        candidate.applicant_type,
        candidate.city,
        candidate.state_region,
        candidate.country,
        candidate.category,
        candidate.sector,
        candidate.finance_route,
        candidate.instrument_type,
        candidate.region_scope,
        candidate.summary,
    )
    return sum(
        value is not None and value != ""
        for value in scalar_values
    )


def _ordered_unique_strings(values: list[str]) -> list[str]:
    """Deduplicate string lists while preserving their first observed order."""
    unique_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return unique_values


def _merge_sources(source_groups: list[list[Any]]) -> list[Any]:
    """Merge namespaced reviewed sources while preserving first-seen order."""
    merged: list[Any] = []
    seen: set[str] = set()
    for group in source_groups:
        for source in group:
            if source.source_ref in seen:
                continue
            seen.add(source.source_ref)
            merged.append(source)
    return merged


def _merge_evidence(evidence_groups: list[list[Any]]) -> list[Any]:
    """Merge namespaced reviewed evidence while preserving first-seen order."""
    merged: list[Any] = []
    seen: set[str] = set()
    for group in evidence_groups:
        for evidence in group:
            if evidence.evidence_ref in seen:
                continue
            seen.add(evidence.evidence_ref)
            merged.append(evidence)
    return merged


def _build_reviewed_candidate(
    *,
    reviewed_project: Any,
    research: Any,
) -> tuple[Any, list[Any]]:
    """Convert one validated reviewed project import into a local candidate."""
    from app.models.cnb_similar_projects import (
        CnbSimilarProjectCandidate,
        CnbSimilarProjectEvidence,
        CnbSimilarProjectReviewSource,
    )

    evidence_items = [
        CnbSimilarProjectEvidence(
            evidence_ref=_local_evidence_ref(
                run_id=research.run_id,
                evidence_ref=retained.evidence.evidence_ref,
            ),
            source_ref=_local_source_ref(
                run_id=research.run_id,
                source_ref=retained.source.source_ref,
            ),
            target_path=retained.evidence.target_path,
            source_location=retained.evidence.source_location,
            quote_or_summary=retained.evidence.quote_or_summary,
        )
        for retained in reviewed_project.evidence
    ]
    sources = _merge_sources(
        [
            [
                CnbSimilarProjectReviewSource(
                    source_ref=_local_source_ref(
                        run_id=research.run_id,
                        source_ref=retained.source.source_ref,
                    ),
                    url=retained.source.url,
                    title=retained.source.title,
                )
            ]
            for retained in reviewed_project.evidence
        ]
    )
    record = reviewed_project.record
    candidate = CnbSimilarProjectCandidate(
        funding_record_id=_candidate_funding_record_id(record),
        funder_id=record.selected_funder_id,
        funder_name=_candidate_funder_name(record),
        is_opportunity=False,
        is_funded_award=True,
        award_status=record.status,
        award_amount=record.award_amount,
        currency=record.currency,
        award_year=record.award_year,
        name=record.name,
        applicant_name=record.applicant_name,
        applicant_type=None,
        city=record.city,
        state_region=record.state_region,
        country=record.country,
        category=record.category,
        sector=None,
        hazards=list(record.hazards),
        interventions=list(record.interventions),
        finance_route=record.finance_route,
        instrument_type=record.instrument_type,
        region_scope=record.region_scope,
        summary=record.summary,
        project_tags=list(record.project_tags),
        known_gaps=_record_gap_texts(research, record.funding_record_ref),
        evidence=evidence_items,
    )
    return candidate, sources


def build_run_input_from_reviewed_pairs(
    *,
    search_request: Any,
    research_review_pairs: list[tuple[Any, Any]],
    known_funder_ids: set[UUID],
) -> Any:
    """Build one local runner input from approved reviewed research pairs."""
    from app.models.cnb_similar_projects import CnbSimilarProjectReviewRunInput
    from app.services.cnb_review_import import prepare_reviewed_reference_import

    grouped_candidates: dict[
        UUID,
        list[tuple[Any, list[Any], str, str]],
    ] = {}
    all_sources: list[Any] = []
    for research, review in research_review_pairs:
        reviewed_import = prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids=known_funder_ids,
        )
        for project in reviewed_import.projects:
            candidate, sources = _build_reviewed_candidate(
                reviewed_project=project,
                research=research,
            )
            grouped_candidates.setdefault(candidate.funding_record_id, []).append(
                (
                    candidate,
                    sources,
                    research.run_id,
                    project.record.funding_record_ref,
                )
            )
            all_sources.extend(sources)

    merged_candidates: list[Any] = []
    for funding_record_id, entries in grouped_candidates.items():
        best_candidate, _, _, _ = min(
            entries,
            key=lambda item: (
                -_candidate_scalar_score(item[0]),
                -len(item[0].evidence),
                item[2],
                item[3],
            ),
        )
        merged_candidate = best_candidate.model_copy(
            update={
                "hazards": _ordered_unique_strings(
                    [
                        value
                        for candidate, _, _, _ in entries
                        for value in candidate.hazards
                    ]
                ),
                "interventions": _ordered_unique_strings(
                    [
                        value
                        for candidate, _, _, _ in entries
                        for value in candidate.interventions
                    ]
                ),
                "project_tags": _ordered_unique_strings(
                    [
                        value
                        for candidate, _, _, _ in entries
                        for value in candidate.project_tags
                    ]
                ),
                "known_gaps": _ordered_unique_strings(
                    [
                        value
                        for candidate, _, _, _ in entries
                        for value in candidate.known_gaps
                    ]
                ),
                "evidence": _merge_evidence(
                    [
                        candidate.evidence
                        for candidate, _, _, _ in entries
                    ]
                ),
            }
        )
        assert merged_candidate.funding_record_id == funding_record_id
        merged_candidates.append(merged_candidate)

    merged_candidates.sort(
        key=lambda candidate: (
            candidate.name.casefold(),
            str(candidate.funder_id),
            str(candidate.funding_record_id),
        )
    )
    return CnbSimilarProjectReviewRunInput(
        search_request=search_request,
        candidates=merged_candidates,
        sources=_merge_sources([all_sources]),
    )


def load_run_input_from_args(args: argparse.Namespace) -> Any:
    """Resolve either preserved input mode or reviewed-pair local input mode."""
    research_paths = list(args.research)
    review_paths = list(args.review)
    if args.input is not None:
        if research_paths or review_paths or args.funders is not None:
            raise ValueError(
                "--research/--review/--funders require --search-request"
            )
        return load_run_input(args.input)
    if args.funders is None:
        raise ValueError("--search-request requires --funders")
    if args.source_bundle is not None:
        raise ValueError("--source-bundle is only valid with --input")
    if not research_paths or not review_paths:
        raise ValueError(
            "--search-request requires at least one --research/--review pair"
        )
    if len(research_paths) != len(review_paths):
        raise ValueError(
            "--research and --review must be repeated the same number of times"
        )
    search_request = load_search_request(args.search_request)
    research_review_pairs = [
        (load_research_bundle(research_path), load_review_artifact(review_path))
        for research_path, review_path in zip(research_paths, review_paths, strict=True)
    ]
    from scripts.cnb_research.research_funded_projects import (
        load_canonical_funders,
    )

    canonical_funders = load_canonical_funders(args.funders)
    return build_run_input_from_reviewed_pairs(
        search_request=search_request,
        research_review_pairs=research_review_pairs,
        known_funder_ids={funder.funder_id for funder in canonical_funders},
    )


def build_run_metadata(
    args: argparse.Namespace,
    *,
    model_name: str,
    reasoning_effort: str,
    prompt_sha256: str,
) -> Any:
    """Build strict, mode-specific provenance for the emitted artifact."""
    from app.models.cnb_similar_projects import (
        CnbSimilarProjectReviewedArtifactPair,
        CnbSimilarProjectReviewedArtifactProvenance,
        CnbSimilarProjectReviewRunMetadata,
    )

    if args.input is not None:
        return CnbSimilarProjectReviewRunMetadata(
            model_name=model_name,
            reasoning_effort=reasoning_effort,
            prompt_sha256=prompt_sha256,
            input_mode="local_review_snapshot",
            source_bundle=(
                str(args.source_bundle.resolve())
                if args.source_bundle is not None
                else None
            ),
        )

    return CnbSimilarProjectReviewRunMetadata(
        model_name=model_name,
        reasoning_effort=reasoning_effort,
        prompt_sha256=prompt_sha256,
        input_mode="reviewed_artifact_pairs",
        reviewed_artifact_provenance=CnbSimilarProjectReviewedArtifactProvenance(
            funder_snapshot_path=str(args.funders.resolve()),
            artifact_pairs=[
                CnbSimilarProjectReviewedArtifactPair(
                    research_path=str(research_path.resolve()),
                    review_path=str(review_path.resolve()),
                )
                for research_path, review_path in zip(
                    args.research,
                    args.review,
                    strict=True,
                )
            ],
        ),
    )


def write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write one deterministic UTF-8 JSON artifact with a trailing newline."""
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def main() -> None:
    """Validate input, call the matcher, and save its review bundle."""
    # Step 1: configure logging and expose service imports without side effects.
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    ensure_service_directory_on_path()

    from openai import OpenAI

    from app.config import get_settings
    from app.models.cnb_similar_projects import (
        CnbSimilarProjectReviewRunArtifact,
        CnbSimilarProjectReviewState,
    )
    from app.services.cnb_similar_project_search import ProjectMatchingService

    # Step 2: reject malformed input or missing provenance before a provider call.
    try:
        run_input = load_run_input_from_args(args)
        if args.source_bundle is not None and not args.source_bundle.is_file():
            raise ValueError(f"Source bundle does not exist: {args.source_bundle}")
        run_directory = args.output.resolve() / str(run_input.search_request.run_id)
        if run_directory.exists():
            raise ValueError(f"Run directory already exists: {run_directory}")
    except (OSError, json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.error("Invalid similar-project review input: %s", exc)
        raise SystemExit(2) from exc

    # Step 3: load shared config and require a real provider credential.
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is required for similar-project matching")
        raise SystemExit(2)
    model_config = settings.llm.models.funding_research
    prompt = settings.llm.prompts.get_prompt("cnb_similar_project_matching")
    prompt_sha256 = hashlib.sha256(prompt.encode("utf-8")).hexdigest()

    # Step 4: execute the matching service against local protocol adapters.
    workflow_store = LocalReviewWorkflowStore()
    reference_data_client = LocalReviewReferenceDataClient(run_input.candidates)
    openai_config = settings.llm.api.openai
    openai_client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=openai_config.base_url,
    )
    try:
        service = ProjectMatchingService.from_settings(
            openai_client=openai_client,
            workflow_store=workflow_store,
            reference_data_client=reference_data_client,
            store_responses=False,
        )
        run_result = service.run(run_input.search_request)
    except Exception:
        logger.exception("Similar-project matching failed")
        raise SystemExit(1) from None
    finally:
        openai_client.close()

    # Step 5: validate the portable review wrapper before creating the run directory.
    generated_at = datetime.now(timezone.utc)
    artifact = CnbSimilarProjectReviewRunArtifact(
        run_id=run_input.search_request.run_id,
        generated_at=generated_at,
        run_metadata=build_run_metadata(
            args,
            model_name=model_config.name,
            reasoning_effort=model_config.reasoning_effort,
            prompt_sha256=prompt_sha256,
        ),
        search_request=run_input.search_request,
        candidates=run_input.candidates,
        completion_signal=run_result.completion_signal,
        result=run_result.result,
        sources=run_input.sources,
        review=CnbSimilarProjectReviewState(
            status="pending_review",
        ),
    )

    # Step 6: save normalized input and result together; never overwrite another run.
    try:
        run_directory.mkdir(parents=True, exist_ok=False)
        input_path = run_directory / f"{artifact.run_id}.similar-projects.input.json"
        artifact_path = run_directory / f"{artifact.run_id}.similar-projects.json"
        write_json(input_path, run_input.model_dump(mode="json"))
        write_json(artifact_path, artifact.model_dump(mode="json"))
    except OSError as exc:
        logger.error("Could not write similar-project run artifacts: %s", exc)
        raise SystemExit(1) from exc

    logger.info("Similar-project run ready for review: %s", artifact_path)


if __name__ == "__main__":
    main()
