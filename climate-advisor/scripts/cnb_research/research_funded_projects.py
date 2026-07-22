"""
Brief: Research funded-project examples for a required target project across one known program or a strict batch.

Inputs:
- CLI args:
  - `--input`: Path to a JSON manifest matching `FundingOpportunityResearchRequest` or a strict batch object with `batch_name` and non-empty `requests`.
  - `--project`: Required path to a `CnbSimilarProjectSearchRequest` JSON profile. The validated profile is included in every research request so discovery remains anchored to the target project.
  - `--funders`: Optional path to a canonical-funder snapshot JSON file. It may be a top-level array or an object with a `funders`, `items`, `results`, or `data` array of `{funder_id, name}` objects. When omitted, discovery still runs and writes empty `candidate_funders` lists for later identity resolution.
  - `--request-index`: Optional 1-based request position for a batch input. Runs only that request and leaves the full batch index unchanged.
  - `--output`: Parent directory for per-run artifacts; defaults to `output/cnb_research`.
  - `--log-level`: Python logging level; defaults to `INFO`.
- Files/paths: the project JSON contains the target project's matching profile. A single-request input contains the exact seeded funder/program names and URLs plus optional `application_template_url`, `current_filled_object`, `target_funded_projects`, and `max_turns`. A batch input adds a human-readable `batch_name` and a non-empty `requests` array of those same request objects.
- Env vars: `OPENAI_API_KEY` calls the configured research model and `FIRECRAWL_API_KEY` calls Firecrawl. Shared MLflow environment variables remain optional and are handled by the reused research pipeline.

Outputs:
- Reuses the existing funding-opportunity research pipeline to create the normal run artifacts under `<output>/<run_id>/`, including `research_bundle.json`, `review.md`, `agent_trace.jsonl`, and source snapshots.
- Adds `<output>/<run_id>/<run_id>.research.json`, a review-ready JSON artifact
  with reviewer-facing `candidate_funders`, `selected_funder_id`, and
  `project_tags` fields on funded-project rows. When a canonical-funder snapshot
  is supplied, candidate matching may fall back to the known dossier funder
  without populating a missing source-reported name.
- For full batch inputs, adds `<output>/<batch-name>.batch.json`, an index artifact listing each generated `run_id` and `<run_id>.research.json` path. A `--request-index` retry writes only the selected request's ordinary per-run artifacts and does not overwrite this index.
- Performs no database reads or writes.

Usage (from ``climate-advisor/``):
- uv run python -m scripts.cnb_research.research_funded_projects \
    --input path/to/research-request.json \
    --project path/to/target-project.json \
    --output output/cnb_research
- uv run python -m scripts.cnb_research.research_funded_projects \
    --input path/to/research-batch.json \
    --project path/to/target-project.json \
    --request-index 3 \
    --output output/cnb_research
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import logging
from pathlib import Path
import re
import sys
from typing import Any, Callable

from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path("output/cnb_research")
SNAPSHOT_LIST_KEYS = ("funders", "items", "results", "data")
BATCH_INDEX_SUFFIX = ".batch.json"


@dataclass(frozen=True, slots=True)
class ResearchBatchInput:
    """Validated batch manifest containing only authoritative request objects."""

    batch_name: str
    requests: tuple[Any, ...]


@dataclass(frozen=True, slots=True)
class ResearchArtifactRecord:
    """One review-ready research artifact created by this CLI."""

    run_id: str
    research_path: Path


class RawResearchBatchInput(BaseModel):
    """Strict JSON shape accepted for funded-project research batches."""

    model_config = ConfigDict(extra="forbid")

    batch_name: str = Field(min_length=1)
    requests: list[object] = Field(min_length=1)


def parse_args() -> argparse.Namespace:
    """Parse the project, research, optional funder, and batch-selection inputs."""
    parser = argparse.ArgumentParser(
        description=(
            "Research funded-project examples for a required target project "
            "and write a review-ready local JSON artifact."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help=(
            "Path to a FundingOpportunityResearchRequest JSON manifest or a "
            "strict batch object with batch_name and requests."
        ),
    )
    parser.add_argument(
        "--project",
        type=Path,
        required=True,
        help=(
            "Path to the required CnbSimilarProjectSearchRequest JSON profile "
            "that anchors every research request."
        ),
    )
    parser.add_argument(
        "--funders",
        type=Path,
        help=(
            "Optional path to a canonical-funder snapshot JSON file. When "
            "omitted, candidate_funders remains empty for later resolution."
        ),
    )
    parser.add_argument(
        "--request-index",
        type=int,
        help=(
            "Optional 1-based request position from a batch input. Runs only "
            "that request and does not rewrite the full batch index."
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


def read_json(path: Path) -> Any:
    """Load one UTF-8 JSON document from disk."""
    return json.loads(path.read_text(encoding="utf-8"))


def extract_snapshot_items(payload: object) -> list[object]:
    """Return the canonical-funder item list from a supported snapshot shape."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in SNAPSHOT_LIST_KEYS:
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError(
        "Canonical-funder snapshot must be a JSON array or an object containing "
        "a funders/items/results/data array."
    )


def load_target_project(path: Path) -> Any:
    """Validate the required target-project profile used by discovery."""
    ensure_service_directory_on_path()
    from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest

    return CnbSimilarProjectSearchRequest.model_validate(read_json(path))


def load_request(path: Path, *, target_project: Any) -> Any:
    """Validate one request or batch and attach the target project to each."""
    ensure_service_directory_on_path()
    from app.models.cnb_research import FundingOpportunityResearchRequest

    payload = read_json(path)
    if isinstance(payload, dict) and (
        "batch_name" in payload or "requests" in payload
    ):
        batch = RawResearchBatchInput.model_validate(payload)
        validated_requests: list[Any] = []
        for index, item in enumerate(batch.requests, start=1):
            try:
                request = FundingOpportunityResearchRequest.model_validate(item)
                validated_requests.append(
                    request.model_copy(update={"target_project": target_project})
                )
            except ValidationError as exc:
                raise ValueError(f"Invalid batch request #{index}: {exc}") from exc
        return ResearchBatchInput(
            batch_name=batch.batch_name,
            requests=tuple(validated_requests),
        )
    request = FundingOpportunityResearchRequest.model_validate(payload)
    return request.model_copy(update={"target_project": target_project})


def load_canonical_funders(path: Path) -> list[Any]:
    """Validate the canonical-funder snapshot against the shared model."""
    ensure_service_directory_on_path()
    from app.models.cnb_research import CanonicalFunder

    payload = read_json(path)
    items = extract_snapshot_items(payload)
    canonical_funders: list[Any] = []
    for index, item in enumerate(items, start=1):
        try:
            canonical_funders.append(CanonicalFunder.model_validate(item))
        except ValidationError as exc:
            raise ValueError(
                f"Invalid canonical-funder snapshot entry #{index}: {exc}"
            ) from exc
    return canonical_funders


def build_research_payload(bundle: Any, funding_records: list[Any]) -> dict[str, Any]:
    """Replace funding records with review-ready funded-project candidate links."""
    payload = bundle.model_dump(mode="json")
    payload["funding_records"] = [
        record.model_dump(mode="json") for record in funding_records
    ]
    return payload


def write_research_artifact(path: Path, payload: dict[str, Any]) -> None:
    """Persist the review-ready research JSON beside the existing run artifacts."""
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def slugify_batch_name(batch_name: str) -> str:
    """Convert a human-readable batch name into a stable artifact filename."""
    slug = re.sub(r"[^a-z0-9]+", "-", batch_name.lower()).strip("-")
    return slug or "batch"


def build_batch_index_payload(
    batch_name: str,
    artifacts: list[ResearchArtifactRecord],
) -> dict[str, Any]:
    """Build a code-owned batch index without adding reviewer-facing facts."""
    return {
        "batch_name": batch_name,
        "runs": [
            {
                "run_id": artifact.run_id,
                "research_path": str(artifact.research_path),
            }
            for artifact in artifacts
        ],
    }


def write_batch_index_artifact(
    *,
    output_root: Path,
    batch_name: str,
    artifacts: list[ResearchArtifactRecord],
) -> Path:
    """Persist a stable batch index artifact at the output root."""
    batch_index_path = (
        output_root.resolve() / f"{slugify_batch_name(batch_name)}{BATCH_INDEX_SUFFIX}"
    )
    payload = build_batch_index_payload(batch_name, artifacts)
    write_research_artifact(batch_index_path, payload)
    return batch_index_path


def rewrite_research_artifact_from_bundle(
    *,
    bundle: Any,
    research_path: Path,
    canonical_funders: list[Any],
    propose_candidates: Callable[..., list[Any]],
) -> ResearchArtifactRecord:
    """Re-enrich a validated bundle and rewrite its review artifact locally."""
    # Rebuild only code-owned candidate fields; do not repeat provider research.
    review_ready_records = propose_candidates(
        funding_records=bundle.funding_records,
        canonical_funders=canonical_funders,
        dossier_funder_name=bundle.request.funder_name,
    )
    research_payload = build_research_payload(bundle, review_ready_records)
    write_research_artifact(research_path, research_payload)
    return ResearchArtifactRecord(run_id=bundle.run_id, research_path=research_path)


def execute_research_request(
    *,
    request: Any,
    output_root: Path,
    canonical_funders: list[Any],
    run_research: Callable[..., Any],
    propose_candidates: Callable[..., list[Any]],
) -> ResearchArtifactRecord:
    """Run one research request, enrich funded projects, and write review JSON."""
    bundle = run_research(
        request,
        output_root=output_root,
    )
    run_directory = output_root.resolve() / bundle.run_id
    research_path = run_directory / f"{bundle.run_id}.research.json"
    return rewrite_research_artifact_from_bundle(
        bundle=bundle,
        research_path=research_path,
        canonical_funders=canonical_funders,
        propose_candidates=propose_candidates,
    )


def run_batch_research(
    *,
    batch: ResearchBatchInput,
    output_root: Path,
    canonical_funders: list[Any],
    run_research: Callable[..., Any],
    propose_candidates: Callable[..., list[Any]],
) -> list[ResearchArtifactRecord]:
    """Run the existing single-request workflow once for each batch request."""
    artifacts: list[ResearchArtifactRecord] = []
    for index, request in enumerate(batch.requests, start=1):
        logger.info(
            "Running funded-project batch request %s/%s for %s / %s",
            index,
            len(batch.requests),
            request.funder_name,
            request.program_name,
        )
        artifacts.append(
            execute_research_request(
                request=request,
                output_root=output_root,
                canonical_funders=canonical_funders,
                run_research=run_research,
                propose_candidates=propose_candidates,
            )
        )
    return artifacts


def main() -> None:
    """Run research, attach canonical-funder candidates, and save the review JSON."""
    # Step 1: parse CLI input and configure logging before any expensive work.
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Step 2: import the shared service code lazily so this module has no import-time path side effects.
    ensure_service_directory_on_path()
    from app.services.cnb_funder_identity_match import (
        propose_funder_identity_candidates,
    )
    from app.services.cnb_research_service import run_funding_opportunity_research

    # Step 3: validate the target project, research manifest, and optional selection.
    selected_batch_position: tuple[int, int] | None = None
    try:
        target_project = load_target_project(args.project)
        request_or_batch = load_request(
            args.input,
            target_project=target_project,
        )
        if args.request_index is not None:
            if not isinstance(request_or_batch, ResearchBatchInput):
                raise ValueError(
                    "--request-index is valid only when --input is a batch manifest."
                )
            request_count = len(request_or_batch.requests)
            if not 1 <= args.request_index <= request_count:
                raise ValueError(
                    "--request-index must be between 1 and "
                    f"{request_count} for this batch; got {args.request_index}."
                )
            selected_batch_position = (args.request_index, request_count)
            request_or_batch = request_or_batch.requests[args.request_index - 1]

        # Canonical funders remain optional for both full and selected runs.
        canonical_funders = (
            load_canonical_funders(args.funders)
            if args.funders is not None
            else []
        )
    except (OSError, json.JSONDecodeError, ValidationError, ValueError) as exc:
        logger.error("Invalid funded-project research input: %s", exc)
        raise SystemExit(2) from exc

    # Step 4: reuse the existing local research pipeline and enrich funded-project rows for review.
    try:
        if selected_batch_position is not None:
            selected_index, request_count = selected_batch_position
            logger.info(
                "Running selected funded-project batch request %s/%s for %s / %s; "
                "the full batch index will not be rewritten",
                selected_index,
                request_count,
                request_or_batch.funder_name,
                request_or_batch.program_name,
            )
        if isinstance(request_or_batch, ResearchBatchInput):
            artifacts = run_batch_research(
                batch=request_or_batch,
                output_root=args.output,
                canonical_funders=canonical_funders,
                run_research=run_funding_opportunity_research,
                propose_candidates=propose_funder_identity_candidates,
            )
            batch_index_path = write_batch_index_artifact(
                output_root=args.output,
                batch_name=request_or_batch.batch_name,
                artifacts=artifacts,
            )
            logger.info(
                "Funded-project batch ready for review: %s",
                batch_index_path,
            )
            return

        artifact = execute_research_request(
            request=request_or_batch,
            output_root=args.output,
            canonical_funders=canonical_funders,
            run_research=run_funding_opportunity_research,
            propose_candidates=propose_funder_identity_candidates,
        )
    except Exception:
        logger.exception("Funded-project research failed")
        raise SystemExit(1) from None

    # Step 5: keep the existing run artifacts untouched and add the review-ready JSON beside them.
    logger.info("Funded-project research ready for review: %s", artifact.research_path)


if __name__ == "__main__":
    main()
