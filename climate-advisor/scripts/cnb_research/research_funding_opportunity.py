"""
Brief: Research one known funding program with the configured model and Firecrawl.

Inputs:
- CLI args:
  - `--input`: JSON manifest matching FundingOpportunityResearchRequest.
  - `--output`: Parent directory for per-run artifacts; defaults to
    `output/cnb_research`.
  - `--log-level`: Python logging level; defaults to `INFO`.
- Files/paths: the manifest contains exact funder/program names and URLs, an
  optional application-template URL, an optional validated
  `current_filled_object`, and an optional positive `max_turns` value that
  defaults to 15.
- Env vars: `OPENROUTER_API_KEY` calls the configured research model and
  `FIRECRAWL_API_KEY` calls Firecrawl. Values are loaded from the Climate
  Advisor `.env` by shared settings and are never written to artifacts.

Outputs:
- Creates `<output>/<run_id>/research_bundle.json`, `review.md`,
  `agent_trace.jsonl`, and Markdown snapshots under `sources/`. The bundle is
  the only JSON artifact and embeds both the request and run metadata.
- When `MLFLOW_ENABLED=true`, records the run, one workflow trace containing
  model and Firecrawl spans, redacted review artifacts, and exact source
  snapshots through the shared best-effort MLflow integration.
- Performs no database reads or writes.

Usage (from project root):
- uv run python -m scripts.cnb_research.research_funding_opportunity \
    --input path/to/research-request.json \
    --output output/cnb_research
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
import sys

from pydantic import ValidationError

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = Path("output/cnb_research")


def parse_args() -> argparse.Namespace:
    """Parse the input manifest, output root, and logging level."""
    parser = argparse.ArgumentParser(
        description=(
            "Research one known funding opportunity and write local review artifacts."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to a FundingOpportunityResearchRequest JSON manifest.",
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


def main() -> None:
    """Validate the manifest, run research, and report the artifact directory."""
    # Step 1: parse CLI options and configure process-level logging.
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Step 2: expose the service package only for this CLI process.
    service_directory = Path(__file__).resolve().parents[2] / "service"
    if str(service_directory) not in sys.path:
        sys.path.insert(0, str(service_directory))

    from app.models.cnb_research import FundingOpportunityResearchRequest
    from app.services.cnb_research_service import run_funding_opportunity_research

    # Step 3: validate the authoritative request before making external calls.
    try:
        manifest = json.loads(args.input.read_text(encoding="utf-8"))
        request = FundingOpportunityResearchRequest.model_validate(manifest)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        logger.error("Invalid research manifest %s: %s", args.input, exc)
        raise SystemExit(2) from exc

    # Step 4: run the isolated research workflow; it owns provider lifecycles.
    try:
        bundle = run_funding_opportunity_research(
            request,
            output_root=args.output,
        )
    except Exception:
        logger.exception("Funding-opportunity research failed")
        raise SystemExit(1) from None

    run_directory = args.output.resolve() / bundle.run_id
    logger.info("Research bundle ready for review: %s", run_directory)


if __name__ == "__main__":
    main()
