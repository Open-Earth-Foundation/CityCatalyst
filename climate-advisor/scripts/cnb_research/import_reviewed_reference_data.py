"""
Brief: Validate and import one reviewed CNB funded-project research pair.

Inputs:
- CLI args:
  - `--research`: Path to `<run_id>.research.json`.
  - `--review`: Path to `<run_id>.review.json` saved by the static reviewer.
  - `--database-url-env`: Environment-variable name containing the managed CNB
    PostgreSQL URL; defaults to `CNB_DATABASE_URL`.
  - `--dry-run`: Validate the pair and database funder identities without writes.
  - `--log-level`: Python logging level; defaults to `INFO`.
- Files/paths: the research and review JSON files must contain the same `run_id`.
- Env vars: `CNB_DATABASE_URL` (or the selected variable) supplies credentials
  for the externally managed CNB reference database. Its value is never logged.

Outputs:
- Validates reviewer approval, canonical funder IDs, curated tags, sources, and
  evidence. Without `--dry-run`, transactionally inserts funded projects,
  source documents, and evidence into the managed reference tables.
- Writes no local artifact and never creates or migrates database tables.

Usage (from project root):
- uv run python -m scripts.cnb_research.import_reviewed_reference_data \
    --research output/cnb_research/<run_id>/<run_id>.research.json \
    --review output/cnb_research/<run_id>/<run_id>.review.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
import sys

from pydantic import ValidationError

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse paired artifact paths, database environment, and execution mode."""
    parser = argparse.ArgumentParser(
        description="Validate and import reviewed CNB funded-project reference data."
    )
    parser.add_argument(
        "--research",
        type=Path,
        required=True,
        help="Path to <run_id>.research.json.",
    )
    parser.add_argument(
        "--review",
        type=Path,
        required=True,
        help="Path to <run_id>.review.json.",
    )
    parser.add_argument(
        "--database-url-env",
        default="CNB_DATABASE_URL",
        help=(
            "Environment variable containing the managed CNB PostgreSQL URL "
            "(default: CNB_DATABASE_URL)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the pair and funder IDs without database writes.",
    )
    parser.add_argument(
        "--log-level",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        default="INFO",
        help="Python logging level (default: INFO).",
    )
    return parser.parse_args()


def main() -> None:
    """Load, pair, validate, and optionally import reviewed reference data."""
    # Step 1: configure CLI logging and the service import path.
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    service_directory = Path(__file__).resolve().parents[2] / "service"
    if str(service_directory) not in sys.path:
        sys.path.insert(0, str(service_directory))

    from app.models.cnb_research import FundingOpportunityResearchBundle
    from app.services.cnb_review_import import (
        PostgresReviewedReferenceDataWriter,
        ReviewedReferenceDataArtifact,
        prepare_reviewed_reference_import,
        selected_funder_ids,
        validate_review_pair,
    )

    # Step 2: parse both strict contracts before touching the database.
    try:
        research = FundingOpportunityResearchBundle.model_validate(
            json.loads(args.research.read_text(encoding="utf-8"))
        )
        review = ReviewedReferenceDataArtifact.model_validate(
            json.loads(args.review.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        logger.error("Invalid research/review artifact pair: %s", exc)
        raise SystemExit(2) from exc

    # Step 3: reject invalid local pairs before requiring external configuration.
    try:
        validate_review_pair(research=research, review=review)
        requested_funder_ids = selected_funder_ids(review)
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids=requested_funder_ids,
        )
    except ValueError as exc:
        logger.error("Reviewed reference data is not importable: %s", exc)
        raise SystemExit(2) from exc

    # Step 4: resolve canonical funders from the managed table and validate.
    database_url = os.getenv(args.database_url_env)
    if not database_url:
        logger.error("%s must be set", args.database_url_env)
        raise SystemExit(2)
    writer = PostgresReviewedReferenceDataWriter(database_url)
    try:
        known_funder_ids = writer.find_existing_funder_ids(requested_funder_ids)
        payload = prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids=known_funder_ids,
        )
    except Exception as exc:
        logger.error("Reviewed reference data is not importable: %s", exc)
        raise SystemExit(2) from exc

    # Step 5: keep dry runs read-only; otherwise perform one transactional write.
    if args.dry_run:
        logger.info(
            "Validated %s funded projects for run %s; no data written",
            len(payload.projects),
            payload.run_id,
        )
        return
    try:
        imported_ids = writer.import_projects(payload)
    except Exception:
        logger.exception("Reviewed reference-data import failed")
        raise SystemExit(1) from None
    logger.info("Imported funding record IDs: %s", ", ".join(map(str, imported_ids)))


if __name__ == "__main__":
    main()
