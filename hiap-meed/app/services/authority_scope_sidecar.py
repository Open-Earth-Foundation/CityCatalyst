"""Authority-scope sidecar load, bind, and five-object retention helpers.

Sidecars live beside the legal CSV under an explicit prefix. Report pods only
read; publication and retention run from the release command.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import UTC, datetime
from typing import Any

from botocore.exceptions import ClientError
from pydantic import ValidationError

from app.config.llm_settings import get_llm_settings
from app.modules.prioritizer.authority_scope import (
    AUTHORITY_SCOPE_CONTRACT_VERSION,
    AUTHORITY_SCOPE_QUALIFIED,
    AUTHORITY_SCOPE_UNSPECIFIED,
    canonical_row_sha256,
    classifier_input_from_legal_row,
    resolve_report_authority_scope,
)
from app.modules.prioritizer.models import (
    ActionLegalAssessmentS3CsvRow,
    AuthorityScopeSidecarRecordV1,
    AuthorityScopeSidecarV1,
)

logger = logging.getLogger(__name__)

DEFAULT_AUTHORITY_SCOPE_SIDECAR_DIR_NAME = "authority-scope"
SIDECAR_OBJECT_NAME_RE = re.compile(
    r"^authority-scope-v1-(?P<stamp>\d{8}T\d{6}Z)\.json$"
)


def get_authority_scope_sidecar_prefix(legal_s3_key: str) -> str:
    """Return the configured or derived sidecar prefix for one legal CSV key."""
    raw_value = os.getenv("HIAP_MEED_LEGAL_AUTHORITY_SCOPE_SIDECAR_PREFIX")
    if raw_value is not None and raw_value.strip():
        return raw_value.strip().rstrip("/") + "/"
    parent = legal_s3_key.rsplit("/", 1)[0] if "/" in legal_s3_key else ""
    if parent:
        return f"{parent}/{DEFAULT_AUTHORITY_SCOPE_SIDECAR_DIR_NAME}/"
    return f"{DEFAULT_AUTHORITY_SCOPE_SIDECAR_DIR_NAME}/"


def get_authority_scope_sidecar_key_override() -> str | None:
    """Return an optional exact sidecar object key override."""
    raw_value = os.getenv("HIAP_MEED_LEGAL_AUTHORITY_SCOPE_SIDECAR_KEY")
    if raw_value is None or not raw_value.strip():
        return None
    return raw_value.strip()


def build_sidecar_object_key(*, prefix: str, generated_at_utc: str) -> str:
    """Build one versioned sidecar object key under the configured prefix."""
    stamp = datetime.fromisoformat(generated_at_utc.replace("Z", "+00:00")).astimezone(
        UTC
    ).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix.rstrip('/')}/authority-scope-v1-{stamp}.json"


def parse_sidecar_payload(payload: dict[str, Any]) -> AuthorityScopeSidecarV1:
    """Validate one sidecar document against the authority-scope-v1 contract."""
    try:
        return AuthorityScopeSidecarV1.model_validate(payload)
    except ValidationError as error:
        raise ValueError("authority-scope sidecar failed schema validation") from error


def classifier_input_from_s3_row(
    *,
    row: ActionLegalAssessmentS3CsvRow,
    country_code: str,
) -> dict[str, Any]:
    """Build classifier input from one S3 CSV legal row."""
    references = [
        value
        for value in (
            row.legal_reference_1,
            row.legal_reference_2,
            row.legal_reference_3,
            row.legal_reference_4,
            row.legal_reference_5,
            row.legal_reference_6,
        )
        if isinstance(value, str) and value.strip()
    ]
    return classifier_input_from_legal_row(
        country_code=country_code,
        action_id=row.action_id,
        verdict_category=row.verdict_category,
        ownership_category=row.ownership_category,
        restrictions_category=row.restrictions_category,
        ownership_description_en=row.ownership_description,
        ownership_description_es=row.ownership_description_es,
        restrictions_description_en=row.restrictions_description,
        restrictions_description_es=row.restrictions_description_es,
        legal_justification_en=row.legal_justification_en or row.legal_justification,
        legal_justification_es=row.legal_justification,
        legal_references=references,
    )


def index_sidecar_records(
    sidecar: AuthorityScopeSidecarV1,
) -> dict[tuple[str, str], AuthorityScopeSidecarRecordV1]:
    """Index sidecar records by country/action."""
    return {
        (record.country_code.strip().upper(), record.action_id): record
        for record in sidecar.records
    }


def _conservative_unbound_scope(
    *,
    verdict_category: str | None,
    ownership_category: str | None,
    status: str,
) -> dict[str, Any]:
    """Return conservative authority-scope fields when a sidecar label is unusable."""
    report_label, resolved_status = resolve_report_authority_scope(
        verdict_category=verdict_category,
        ownership_category=ownership_category,
        selected_label=None,
        label_accepted=False,
        confidence_passed=False,
    )
    if status not in {resolved_status, "missing_sidecar"}:
        # Preserve the more specific rejection reason from the binder.
        pass
    if report_label == AUTHORITY_SCOPE_UNSPECIFIED and verdict_category in {
        "enabled",
        "conditional",
    }:
        report_label = AUTHORITY_SCOPE_QUALIFIED
    return {
        "authority_scope_selected_label": None,
        "authority_scope_report_label": report_label,
        "authority_scope_status": status,
        "authority_scope_confidence_passed": None,
    }


def bind_sidecar_label_to_row(
    *,
    country_code: str,
    action_id: str,
    verdict_category: str | None,
    ownership_category: str | None,
    classifier_input: dict[str, Any],
    sidecar: AuthorityScopeSidecarV1 | None,
    source_etag: str | None,
) -> dict[str, Any]:
    """Bind one legal row to a sidecar label, or fall closed conservatively."""
    row_hash = canonical_row_sha256(classifier_input)
    provenance: dict[str, Any] = {
        "contract_version": AUTHORITY_SCOPE_CONTRACT_VERSION,
        "canonical_row_sha256": row_hash,
        "source_etag": source_etag,
    }
    if sidecar is None:
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status="missing_sidecar",
        )
        provenance["status"] = unbound["authority_scope_status"]
        return {
            **unbound,
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }

    provenance.update(
        {
            "sidecar_source_s3_bucket": sidecar.source_s3_bucket,
            "sidecar_source_s3_key": sidecar.source_s3_key,
            "sidecar_source_etag": sidecar.source_etag,
            "sidecar_model_id": sidecar.model_id,
            "sidecar_rubric_version": sidecar.rubric_version,
            "sidecar_generated_at_utc": sidecar.generated_at_utc,
        }
    )
    normalized_etag = (source_etag or "").strip().strip('"')
    sidecar_etag = (sidecar.source_etag or "").strip().strip('"')
    if not normalized_etag or not sidecar_etag:
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status="missing_etag",
        )
        provenance["status"] = "missing_etag"
        return {
            **unbound,
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }
    if normalized_etag != sidecar_etag:
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status="stale_sidecar",
        )
        provenance["status"] = "stale_sidecar"
        return {
            **unbound,
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }

    record = index_sidecar_records(sidecar).get(
        (country_code.strip().upper(), action_id)
    )
    if record is None or record.canonical_row_sha256 != row_hash:
        status = "stale_sidecar" if record is not None else "missing_sidecar"
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status=status,
        )
        provenance["status"] = status
        return {
            "authority_scope_selected_label": (
                record.selected_label if record is not None else None
            ),
            "authority_scope_report_label": unbound["authority_scope_report_label"],
            "authority_scope_status": status,
            "authority_scope_confidence_passed": (
                record.confidence_passed if record is not None else None
            ),
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }

    if record.review_status == "pending_human_review":
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status="pending_human_review",
        )
        provenance.update(
            {
                "status": "pending_human_review",
                "selected_label": record.selected_label,
                "review_status": record.review_status,
            }
        )
        return {
            "authority_scope_selected_label": record.selected_label,
            "authority_scope_report_label": unbound["authority_scope_report_label"],
            "authority_scope_status": "pending_human_review",
            "authority_scope_confidence_passed": record.confidence_passed,
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }
    if record.review_status != "human_accepted":
        unbound = _conservative_unbound_scope(
            verdict_category=verdict_category,
            ownership_category=ownership_category,
            status="human_rejected",
        )
        provenance.update(
            {
                "status": "human_rejected",
                "selected_label": record.selected_label,
                "review_status": record.review_status,
            }
        )
        return {
            "authority_scope_selected_label": record.selected_label,
            "authority_scope_report_label": unbound["authority_scope_report_label"],
            "authority_scope_status": "human_rejected",
            "authority_scope_confidence_passed": record.confidence_passed,
            "authority_scope_canonical_row_sha256": row_hash,
            "authority_scope_provenance": provenance,
        }

    recomputed_confidence_passed = record.confidence >= record.confidence_threshold
    report_label, status = resolve_report_authority_scope(
        verdict_category=verdict_category,
        ownership_category=ownership_category,
        selected_label=record.selected_label,
        label_accepted=True,
        confidence_passed=recomputed_confidence_passed,
    )
    provenance.update(
        {
            "status": status,
            "selected_label": record.selected_label,
            "confidence": record.confidence,
            "confidence_threshold": record.confidence_threshold,
            "confidence_passed": recomputed_confidence_passed,
            "review_status": record.review_status,
            "probabilities": record.probabilities,
        }
    )
    return {
        "authority_scope_selected_label": record.selected_label,
        "authority_scope_report_label": report_label,
        "authority_scope_status": status,
        "authority_scope_confidence_passed": recomputed_confidence_passed,
        "authority_scope_canonical_row_sha256": row_hash,
        "authority_scope_provenance": provenance,
    }


def select_newest_matching_sidecar_key(
    *,
    object_summaries: list[dict[str, Any]],
    prefix: str,
) -> str | None:
    """Pick the newest authority-scope-v1 object under the exact prefix."""
    candidates: list[tuple[str, str]] = []
    for summary in object_summaries:
        key = summary.get("Key")
        if not isinstance(key, str) or not key.startswith(prefix):
            continue
        name = key[len(prefix) :]
        match = SIDECAR_OBJECT_NAME_RE.match(name)
        if match is None:
            continue
        candidates.append((match.group("stamp"), key))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def list_sidecar_keys_for_retention(
    *,
    object_summaries: list[dict[str, Any]],
    prefix: str,
    keep_newest: int | None = None,
) -> tuple[list[str], list[str]]:
    """Return (keep_keys, delete_keys) for the exact sidecar prefix only."""
    keep_count = keep_newest
    if keep_count is None:
        keep_count = get_llm_settings().jev.retention_keep_newest
    candidates: list[tuple[str, str]] = []
    for summary in object_summaries:
        key = summary.get("Key")
        if not isinstance(key, str) or not key.startswith(prefix):
            continue
        name = key[len(prefix) :]
        match = SIDECAR_OBJECT_NAME_RE.match(name)
        if match is None:
            continue
        candidates.append((match.group("stamp"), key))
    candidates.sort(key=lambda item: item[0], reverse=True)
    keep_keys = [key for _, key in candidates[:keep_count]]
    delete_keys = [key for _, key in candidates[keep_count:]]
    return keep_keys, delete_keys


def download_sidecar_json(
    *,
    s3_client: Any,
    bucket: str,
    key: str,
) -> dict[str, Any] | None:
    """Download and parse one sidecar JSON object, or return None on miss/error."""
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
    except ClientError as error:
        error_code = str(error.response.get("Error", {}).get("Code", "Unknown"))
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            logger.info(
                "Authority-scope sidecar not found bucket=%s key_suffix=%s",
                bucket,
                key.rsplit("/", 1)[-1],
            )
            return None
        logger.warning(
            "Authority-scope sidecar fetch failed bucket=%s key_suffix=%s error_code=%s",
            bucket,
            key.rsplit("/", 1)[-1],
            error_code,
        )
        return None
    except Exception:
        logger.warning(
            "Authority-scope sidecar fetch failed bucket=%s key_suffix=%s",
            bucket,
            key.rsplit("/", 1)[-1],
            exc_info=True,
        )
        return None

    body = response.get("Body")
    if body is None or not hasattr(body, "read"):
        return None
    try:
        import json

        payload = json.loads(body.read().decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        logger.warning(
            "Authority-scope sidecar JSON decode failed key_suffix=%s",
            key.rsplit("/", 1)[-1],
        )
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def load_matching_authority_scope_sidecar(
    *,
    s3_client: Any,
    bucket: str,
    legal_s3_key: str,
    source_etag: str | None,
) -> AuthorityScopeSidecarV1 | None:
    """Load the newest valid sidecar for the legal CSV, or None when unavailable."""
    prefix = get_authority_scope_sidecar_prefix(legal_s3_key)
    override_key = get_authority_scope_sidecar_key_override()
    candidate_keys: list[str] = []
    if override_key is not None:
        candidate_keys.append(override_key)
    else:
        try:
            paginator = s3_client.get_paginator("list_objects_v2")
            summaries: list[dict[str, Any]] = []
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                summaries.extend(page.get("Contents") or [])
            newest = select_newest_matching_sidecar_key(
                object_summaries=summaries,
                prefix=prefix,
            )
            if newest is not None:
                candidate_keys.append(newest)
        except Exception:
            logger.warning(
                "Authority-scope sidecar listing failed bucket=%s prefix=%s",
                bucket,
                prefix,
                exc_info=True,
            )
            return None

    for key in candidate_keys:
        payload = download_sidecar_json(s3_client=s3_client, bucket=bucket, key=key)
        if payload is None:
            continue
        try:
            sidecar = parse_sidecar_payload(payload)
        except ValueError:
            logger.warning(
                "Authority-scope sidecar rejected as invalid key_suffix=%s",
                key.rsplit("/", 1)[-1],
            )
            continue
        if sidecar.source_s3_bucket != bucket or sidecar.source_s3_key != legal_s3_key:
            logger.warning(
                "Authority-scope sidecar source object mismatch key_suffix=%s",
                key.rsplit("/", 1)[-1],
            )
            continue
        normalized_etag = (source_etag or "").strip().strip('"')
        sidecar_etag = (sidecar.source_etag or "").strip().strip('"')
        if not normalized_etag or not sidecar_etag:
            logger.info(
                "Authority-scope sidecar rejected for missing ETag key_suffix=%s",
                key.rsplit("/", 1)[-1],
            )
            continue
        if normalized_etag != sidecar_etag:
            logger.info(
                "Authority-scope sidecar ETag mismatch; treating as unavailable "
                "key_suffix=%s",
                key.rsplit("/", 1)[-1],
            )
            continue
        return sidecar
    return None
