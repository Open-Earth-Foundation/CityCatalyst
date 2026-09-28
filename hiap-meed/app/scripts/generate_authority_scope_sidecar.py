"""Release-time authority-scope sidecar generation and five-object retention.

Two-stage workflow (required):

1. Generate a local sidecar for legal review (calls Jev once):

  uv run python -m app.scripts.generate_authority_scope_sidecar \\
    --csv path/to/legal-classification-v2.csv \\
    --source-bucket test-global-api \\
    --source-key raw_data/.../legal-classification-v2.csv \\
    --source-etag '"abc"' \\
    --output /tmp/authority-scope-v1.json

2. After the legal owner marks every record `human_accepted` in that file,
   publish the *same* artifact without calling Jev again:

  uv run python -m app.scripts.generate_authority_scope_sidecar \\
    --publish \\
    --sidecar /tmp/authority-scope-v1.json \\
    --csv path/to/legal-classification-v2.csv \\
    --source-bucket test-global-api \\
    --source-key raw_data/.../legal-classification-v2.csv \\
    --source-etag '"abc"' \\
    --retain-newest 5

Report-serving pods must never run this command.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any

from app.config.llm_settings import get_llm_settings
from app.modules.prioritizer.authority_scope import (
    AUTHORITY_SCOPE_CONTRACT_VERSION,
    AUTHORITY_SCOPE_RUBRIC_VERSION,
    canonical_row_sha256,
)
from app.modules.prioritizer.models import (
    ActionLegalAssessmentS3CsvRow,
    AuthorityScopeSidecarRecordV1,
    AuthorityScopeSidecarV1,
)
from app.services.authority_scope_sidecar import (
    build_sidecar_object_key,
    classifier_input_from_s3_row,
    get_authority_scope_sidecar_prefix,
    list_sidecar_keys_for_retention,
    parse_sidecar_payload,
)
from app.services.openrouter_jev_client import (
    OpenRouterJevClient,
    OpenRouterJevError,
    get_jev_confidence_threshold,
    get_jev_model_id,
)

logger = logging.getLogger(__name__)


def _load_csv_rows(csv_text: str) -> list[ActionLegalAssessmentS3CsvRow]:
    """Parse and validate legal CSV rows."""
    return [
        ActionLegalAssessmentS3CsvRow.model_validate(row)
        for row in csv.DictReader(StringIO(csv_text))
    ]


def eligible_action_ids(
    rows: list[ActionLegalAssessmentS3CsvRow],
) -> set[str]:
    """Return action IDs that must appear in a publishable sidecar."""
    return {row.action_id for row in rows if row.verdict_category != "blocked"}


def load_sidecar_from_path(path: Path) -> AuthorityScopeSidecarV1:
    """Load and schema-validate one reviewed sidecar artifact."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"sidecar file is not a JSON object: {path}")
    return parse_sidecar_payload(payload)


def validate_sidecar_matches_csv_release(
    *,
    sidecar: AuthorityScopeSidecarV1,
    rows: list[ActionLegalAssessmentS3CsvRow],
    country_code: str,
    source_bucket: str,
    source_key: str,
    source_etag: str,
) -> None:
    """Refuse publication when the reviewed artifact does not match this CSV release."""
    normalized_etag = source_etag.strip().strip('"')
    sidecar_etag = (sidecar.source_etag or "").strip().strip('"')
    if not normalized_etag or not sidecar_etag:
        raise RuntimeError("refusing to publish sidecar without a nonempty source ETag")
    if sidecar.source_s3_bucket != source_bucket:
        raise RuntimeError(
            "reviewed sidecar source_s3_bucket does not match --source-bucket"
        )
    if sidecar.source_s3_key != source_key:
        raise RuntimeError(
            "reviewed sidecar source_s3_key does not match --source-key"
        )
    if sidecar_etag != normalized_etag:
        raise RuntimeError(
            "reviewed sidecar source_etag does not match --source-etag"
        )

    expected_ids = eligible_action_ids(rows)
    record_by_action = {record.action_id: record for record in sidecar.records}
    for row in rows:
        if row.verdict_category == "blocked":
            continue
        record = record_by_action.get(row.action_id)
        if record is None:
            raise RuntimeError(
                f"reviewed sidecar missing record for action_id={row.action_id}"
            )
        classifier_input = classifier_input_from_s3_row(
            row=row,
            country_code=country_code,
        )
        expected_hash = canonical_row_sha256(classifier_input)
        if record.canonical_row_sha256 != expected_hash:
            raise RuntimeError(
                "reviewed sidecar row hash mismatch for "
                f"action_id={row.action_id}; regenerate and re-review"
            )
        if record.country_code.strip().upper() != country_code.strip().upper():
            raise RuntimeError(
                f"reviewed sidecar country mismatch for action_id={row.action_id}"
            )
    unexpected = sorted(set(record_by_action) - expected_ids)
    if unexpected:
        raise RuntimeError(
            "reviewed sidecar has unexpected action_id values: "
            + ", ".join(unexpected)
        )


def build_sidecar_from_rows(
    *,
    rows: list[ActionLegalAssessmentS3CsvRow],
    country_code: str,
    source_bucket: str,
    source_key: str,
    source_etag: str,
    source_last_modified: str | None,
    jev_client: OpenRouterJevClient,
    review_status: str = "pending_human_review",
) -> AuthorityScopeSidecarV1:
    """Classify eligible rows and return one authority-scope-v1 sidecar."""
    settings = get_llm_settings()
    model_id = get_jev_model_id()
    threshold = get_jev_confidence_threshold()
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    records: list[AuthorityScopeSidecarRecordV1] = []

    for row in rows:
        if row.verdict_category == "blocked":
            continue
        classifier_input = classifier_input_from_s3_row(
            row=row,
            country_code=country_code,
        )
        row_hash = canonical_row_sha256(classifier_input)
        try:
            result = jev_client.classify_authority_scope(
                classifier_input=classifier_input,
                model_id=model_id,
            )
        except OpenRouterJevError:
            logger.exception(
                "Skipping action_id=%s after Jev failure; operator must adjudicate",
                row.action_id,
            )
            continue
        confidence = float(result["confidence"])
        confidence_passed = confidence >= threshold
        records.append(
            AuthorityScopeSidecarRecordV1.model_validate(
                {
                    "country_code": country_code.strip().upper(),
                    "action_id": row.action_id,
                    "canonical_row_sha256": row_hash,
                    "selected_label": result["selected_label"],
                    "probabilities": result["probabilities"],
                    "chosen_label_probability": result["chosen_label_probability"],
                    "confidence": confidence,
                    "confidence_threshold": threshold,
                    "confidence_passed": confidence_passed,
                    "model_id": model_id,
                    "rubric_version": AUTHORITY_SCOPE_RUBRIC_VERSION,
                    "review_status": review_status,
                    "classified_at_utc": generated_at,
                }
            )
        )

    return AuthorityScopeSidecarV1.model_validate(
        {
            "contract_version": AUTHORITY_SCOPE_CONTRACT_VERSION,
            "rubric_version": AUTHORITY_SCOPE_RUBRIC_VERSION,
            "model_id": model_id,
            "confidence_threshold": threshold,
            "source_s3_bucket": source_bucket,
            "source_s3_key": source_key,
            "source_etag": source_etag,
            "source_last_modified": source_last_modified,
            "generated_at_utc": generated_at,
            "retention_keep_newest": settings.jev.retention_keep_newest,
            "records": records,
        }
    )


def assert_sidecar_ready_for_publication(
    *,
    sidecar: AuthorityScopeSidecarV1,
    expected_action_ids: set[str],
) -> None:
    """Refuse publication of incomplete, pending, or rejected sidecars."""
    if not (sidecar.source_etag or "").strip().strip('"'):
        raise RuntimeError("refusing to publish sidecar without a nonempty source ETag")
    if not expected_action_ids:
        raise RuntimeError(
            "refusing to publish sidecar with no eligible legal rows to classify"
        )
    record_ids = {record.action_id for record in sidecar.records}
    missing = sorted(expected_action_ids - record_ids)
    if missing:
        raise RuntimeError(
            "refusing to publish incomplete sidecar; missing action_id values: "
            + ", ".join(missing)
        )
    unexpected = sorted(record_ids - expected_action_ids)
    if unexpected:
        raise RuntimeError(
            "refusing to publish sidecar with unexpected action_id values: "
            + ", ".join(unexpected)
        )
    pending_or_rejected = [
        record.action_id
        for record in sidecar.records
        if record.review_status != "human_accepted"
    ]
    if pending_or_rejected:
        raise RuntimeError(
            "refusing to publish sidecar until every record is human_accepted; "
            f"unaccepted={pending_or_rejected}"
        )


def publish_sidecar_and_retain(
    *,
    s3_client: Any,
    sidecar: AuthorityScopeSidecarV1,
    retain_newest: int,
    expected_action_ids: set[str],
) -> str:
    """Publish sidecar, read it back, then delete older objects under its prefix."""
    assert_sidecar_ready_for_publication(
        sidecar=sidecar,
        expected_action_ids=expected_action_ids,
    )
    prefix = get_authority_scope_sidecar_prefix(sidecar.source_s3_key)
    key = build_sidecar_object_key(
        prefix=prefix,
        generated_at_utc=sidecar.generated_at_utc,
    )
    body = sidecar.model_dump_json(indent=2).encode("utf-8")
    s3_client.put_object(
        Bucket=sidecar.source_s3_bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
    )
    read_back = s3_client.get_object(Bucket=sidecar.source_s3_bucket, Key=key)
    read_payload = json.loads(read_back["Body"].read().decode("utf-8"))
    parsed = parse_sidecar_payload(read_payload)
    if parsed.source_etag.strip().strip('"') != sidecar.source_etag.strip().strip('"'):
        raise RuntimeError("published sidecar source_etag mismatch after read-back")
    if json.loads(parsed.model_dump_json()) != json.loads(sidecar.model_dump_json()):
        raise RuntimeError("published sidecar content mismatch after read-back")

    paginator = s3_client.get_paginator("list_objects_v2")
    summaries: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=sidecar.source_s3_bucket, Prefix=prefix):
        summaries.extend(page.get("Contents") or [])
    _keep_keys, delete_keys = list_sidecar_keys_for_retention(
        object_summaries=summaries,
        prefix=prefix,
        keep_newest=retain_newest,
    )
    for delete_key in delete_keys:
        if delete_key == key:
            continue
        if not delete_key.startswith(prefix):
            raise RuntimeError(
                f"refusing to delete object outside sidecar prefix: {delete_key}"
            )
        if delete_key == sidecar.source_s3_key:
            raise RuntimeError("refusing to delete the legal CSV object")
        s3_client.delete_object(Bucket=sidecar.source_s3_bucket, Key=delete_key)
        logger.info(
            "Deleted older authority-scope sidecar key_suffix=%s",
            delete_key.rsplit("/", 1)[-1],
        )
    return key


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for release-time sidecar generation or publish-only."""
    parser = argparse.ArgumentParser(
        description=(
            "Generate an authority-scope-v1 sidecar for legal review, or publish "
            "an already reviewed sidecar without reclassifying."
        )
    )
    parser.add_argument("--csv", required=True, help="Path to the legal classification CSV")
    parser.add_argument("--country-code", default="CL")
    parser.add_argument("--source-bucket", required=True)
    parser.add_argument("--source-key", required=True)
    parser.add_argument("--source-etag", required=True)
    parser.add_argument("--source-last-modified", default=None)
    parser.add_argument(
        "--output",
        default=None,
        help="Local sidecar JSON path for generate mode",
    )
    parser.add_argument(
        "--sidecar",
        default=None,
        help="Reviewed sidecar JSON path for publish mode (no Jev call)",
    )
    parser.add_argument(
        "--review-status",
        default="pending_human_review",
        choices=["pending_human_review", "human_accepted", "human_rejected"],
        help="Initial review_status for newly generated records only",
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Publish --sidecar after validating it against the CSV; never reclassifies",
    )
    parser.add_argument("--retain-newest", type=int, default=None)
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    csv_text = Path(args.csv).read_text(encoding="utf-8-sig")
    rows = _load_csv_rows(csv_text)
    expected_ids = eligible_action_ids(rows)

    if args.publish:
        if not args.sidecar:
            parser.error("--publish requires --sidecar pointing at the reviewed artifact")
        if args.output:
            parser.error("--publish does not accept --output; publish the reviewed --sidecar")
        sidecar_path = Path(args.sidecar)
        sidecar = load_sidecar_from_path(sidecar_path)
        validate_sidecar_matches_csv_release(
            sidecar=sidecar,
            rows=rows,
            country_code=args.country_code,
            source_bucket=args.source_bucket,
            source_key=args.source_key,
            source_etag=args.source_etag,
        )
        import boto3

        retain = args.retain_newest
        if retain is None:
            retain = get_llm_settings().jev.retention_keep_newest
        published_key = publish_sidecar_and_retain(
            s3_client=boto3.client("s3"),
            sidecar=sidecar,
            retain_newest=retain,
            expected_action_ids=expected_ids,
        )
        logger.info(
            "Published reviewed sidecar path=%s key=%s without reclassification",
            sidecar_path,
            published_key,
        )
        return 0

    if not args.output:
        parser.error("generate mode requires --output")
    sidecar = build_sidecar_from_rows(
        rows=rows,
        country_code=args.country_code,
        source_bucket=args.source_bucket,
        source_key=args.source_key,
        source_etag=args.source_etag,
        source_last_modified=args.source_last_modified,
        jev_client=OpenRouterJevClient(),
        review_status=args.review_status,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(sidecar.model_dump_json(indent=2) + "\n", encoding="utf-8")
    logger.info(
        "Wrote local sidecar for review path=%s records=%s contract=%s",
        output_path,
        len(sidecar.records),
        sidecar.contract_version,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
