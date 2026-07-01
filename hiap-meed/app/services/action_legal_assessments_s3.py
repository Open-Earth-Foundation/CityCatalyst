"""Synchronous S3-backed loader for action legal assessments CSV data."""

from __future__ import annotations

import csv
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from typing import Any

from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    EndpointConnectionError,
    NoCredentialsError,
    NoRegionError,
    PartialCredentialsError,
)
from pydantic import ValidationError

from app.modules.prioritizer.internal_models import LegalAssessmentRecord
from app.modules.prioritizer.models import ActionLegalAssessmentS3CsvRow
from app.services.http_client import UpstreamApiError

logger = logging.getLogger(__name__)

DEFAULT_LEGAL_S3_BUCKET = "test-global-api"
DEFAULT_LEGAL_S3_KEY = (
    "raw_data/cl_ssg/cl_ssg_legal_signals/release/v2/legal-classification-v2.csv"
)
DEFAULT_LEGAL_S3_COUNTRY_CODE = "CL"
LEGAL_ASSESSMENTS_S3_ENDPOINT = "s3:GetObject legal classification CSV"


def get_legal_s3_bucket() -> str:
    """Return the configured S3 bucket for legal assessment CSV data."""
    raw_value = os.getenv("HIAP_MEED_LEGAL_S3_BUCKET")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_LEGAL_S3_BUCKET
    return raw_value.strip()


def get_legal_s3_key() -> str:
    """Return the configured S3 object key for legal assessment CSV data."""
    raw_value = os.getenv("HIAP_MEED_LEGAL_S3_KEY")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_LEGAL_S3_KEY
    return raw_value.strip()


def get_legal_s3_region() -> str | None:
    """Return an optional explicit AWS region for the legal S3 client."""
    raw_value = os.getenv("HIAP_MEED_LEGAL_S3_REGION")
    if raw_value is None or not raw_value.strip():
        return None
    return raw_value.strip()


def _clean_text(value: str | None) -> str | None:
    """Return a stripped string or None when the value is blank."""
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _clean_references(*values: str | None) -> list[str]:
    """Build a legal references list from numbered CSV columns."""
    references: list[str] = []
    for value in values:
        cleaned = _clean_text(value)
        if cleaned is not None:
            references.append(cleaned)
    return references


def _clean_i18n_map(**values: str | None) -> dict[str, str]:
    """Build an i18n text map while skipping blank language values."""
    cleaned_values: dict[str, str] = {}
    for language, value in values.items():
        cleaned = _clean_text(value)
        if cleaned is not None:
            cleaned_values[language] = cleaned
    return cleaned_values


def _format_s3_timestamp(value: object) -> str | None:
    """Return an ISO timestamp for S3 LastModified metadata when present."""
    if not isinstance(value, datetime):
        return None
    timestamp = value
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.isoformat()


def _redacted_s3_uri(bucket: str, key: str) -> str:
    """Return a log-safe S3 object hint without exposing the full key."""
    file_name = key.rsplit("/", 1)[-1]
    return f"s3://{bucket}/.../{file_name}"


def _client_error_code(error: ClientError) -> str:
    """Return the AWS service error code from a ClientError."""
    return str(error.response.get("Error", {}).get("Code", "Unknown"))


def _client_error_status_code(error: ClientError) -> int | None:
    """Return the AWS HTTP status code from a ClientError when available."""
    status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return status_code if isinstance(status_code, int) else None


def _s3_fetch_error_message(error: Exception) -> str:
    """Return a specific, non-secret message for one S3 fetch failure."""
    if isinstance(error, NoCredentialsError):
        return "legal assessments S3 credentials are not configured"
    if isinstance(error, PartialCredentialsError):
        return "legal assessments S3 credentials are incomplete"
    if isinstance(error, NoRegionError):
        return "legal assessments S3 region is not configured"
    if isinstance(error, EndpointConnectionError):
        return "legal assessments S3 endpoint is unreachable"
    if isinstance(error, ClientError):
        error_code = _client_error_code(error)
        if error_code in {"AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            return (
                "legal assessments S3 access was denied; verify AWS credentials "
                "allow s3:GetObject for the configured object"
            )
        if error_code in {"ExpiredToken", "TokenRefreshRequired"}:
            return "legal assessments S3 credentials are expired"
        if error_code in {"NoSuchBucket", "NoSuchKey", "404", "NotFound"}:
            return "legal assessments S3 object was not found; verify bucket and key"
        return f"legal assessments S3 returned AWS error {error_code}"
    if isinstance(error, BotoCoreError):
        return "legal assessments S3 client failed before reading the CSV"
    return "legal assessments S3 source is temporarily unavailable"


def _map_s3_csv_row_to_legal_assessment_record(
    *,
    row: ActionLegalAssessmentS3CsvRow,
    country_code: str,
    source_metadata: dict[str, Any],
) -> LegalAssessmentRecord:
    """Map one S3 CSV row into the existing backend legal record contract."""
    row_raw = row.model_dump(mode="json")
    row_raw.update(
        {
            "srcActionId": row.action_id,
            "countryCode": country_code,
            "gpcSector": row.sector,
        }
    )
    return LegalAssessmentRecord.model_validate(
        {
            "action_id": row.action_id,
            "country_code": country_code,
            "gpc_sector": row.sector,
            "verdict_category": row.verdict_category,
            "verdict_score": row.verdict_score,
            "ownership_category": row.ownership_category,
            "ownership_score": row.ownership_score,
            "ownership_weight": row.ownership_weight,
            "ownership_description": row.ownership_description,
            "restrictions_category": row.restrictions_category,
            "restrictions_score": row.restrictions_score,
            "restrictions_weight": row.restrictions_weight,
            "restrictions_description": row.restrictions_description,
            "legal_justification": row.legal_justification,
            "analysis_date": row.analysis_date,
            "generation_method": row.generation_method,
            "legal_references": _clean_references(
                row.legal_reference_1,
                row.legal_reference_2,
                row.legal_reference_3,
                row.legal_reference_4,
                row.legal_reference_5,
                row.legal_reference_6,
            ),
            "ownership_description_i18n": _clean_i18n_map(
                en=row.ownership_description,
                es=row.ownership_description_es,
            ),
            "restrictions_description_i18n": _clean_i18n_map(
                en=row.restrictions_description,
                es=row.restrictions_description_es,
            ),
            "legal_justification_i18n": _clean_i18n_map(
                en=row.legal_justification_en,
                es=row.legal_justification,
            ),
            "raw": row_raw,
            "source_metadata": source_metadata,
        }
    )


@dataclass
class ActionLegalAssessmentsS3Service:
    """Fetch and map legal assessments from the configured private S3 CSV."""

    bucket: str | None = None
    key: str | None = None
    region_name: str | None = None
    s3_client: Any | None = None

    def __post_init__(self) -> None:
        """Resolve S3 configuration from environment when omitted."""
        if self.bucket is None:
            self.bucket = get_legal_s3_bucket()
        if self.key is None:
            self.key = get_legal_s3_key()
        if self.region_name is None:
            self.region_name = get_legal_s3_region()

    def _get_s3_client(self) -> Any:
        """Return a boto3 S3 client, creating it lazily on first use."""
        if self.s3_client is not None:
            return self.s3_client
        import boto3

        if self.region_name is not None:
            self.s3_client = boto3.client("s3", region_name=self.region_name)
        else:
            self.s3_client = boto3.client("s3")
        return self.s3_client

    def _download_csv_text(self) -> tuple[str, dict[str, Any]]:
        """Download the configured S3 object and return decoded CSV plus metadata."""
        assert self.bucket is not None
        assert self.key is not None
        try:
            response = self._get_s3_client().get_object(
                Bucket=self.bucket,
                Key=self.key,
            )
        except Exception as error:
            error_code = (
                _client_error_code(error) if isinstance(error, ClientError) else None
            )
            logger.warning(
                "Legal assessments S3 fetch failed source=%s error_type=%s error_code=%s",
                _redacted_s3_uri(self.bucket, self.key),
                type(error).__name__,
                error_code,
            )
            raise UpstreamApiError(
                status_code=503,
                message=_s3_fetch_error_message(error),
                upstream_status_code=(
                    _client_error_status_code(error)
                    if isinstance(error, ClientError)
                    else None
                ),
                url=None,
            ) from error

        body = response.get("Body")
        if body is None or not hasattr(body, "read"):
            raise UpstreamApiError(
                status_code=502,
                message="legal assessments S3 source returned an unreadable CSV object",
                url=None,
            )
        csv_text = body.read().decode("utf-8-sig")
        metadata = {
            "etag": response.get("ETag"),
            "last_modified": _format_s3_timestamp(response.get("LastModified")),
        }
        return csv_text, metadata

    def _source_metadata(
        self,
        *,
        country_code: str,
        object_metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """Return artifact metadata for this S3 legal fetch."""
        assert self.bucket is not None
        assert self.key is not None
        return {
            "mock_file_path": None,
            "upstream_url": f"s3://{self.bucket}/{self.key}",
            "upstream_endpoint": LEGAL_ASSESSMENTS_S3_ENDPOINT,
            "http_status_code": None,
            "requested_country_code": country_code,
            "source_type": "s3_csv",
            "s3_bucket": self.bucket,
            "s3_key_suffix": self.key.rsplit("/", 1)[-1],
            "upstream_generated_at_utc": object_metadata.get("last_modified"),
            "fetched_at_utc": datetime.now(UTC).isoformat(),
            "etag": object_metadata.get("etag"),
        }

    def get_assessments_by_action_id(
        self,
        country_code: str,
    ) -> dict[str, LegalAssessmentRecord]:
        """Fetch the country-scoped CSV and map legal rows by action ID."""
        normalized_country_code = country_code.strip().upper()
        if normalized_country_code != DEFAULT_LEGAL_S3_COUNTRY_CODE:
            return {}

        csv_text, object_metadata = self._download_csv_text()
        source_metadata = self._source_metadata(
            country_code=normalized_country_code,
            object_metadata=object_metadata,
        )
        try:
            rows = [
                ActionLegalAssessmentS3CsvRow.model_validate(row)
                for row in csv.DictReader(StringIO(csv_text))
            ]
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message="legal assessments S3 CSV failed schema validation",
                url=None,
            ) from error

        assessments_by_action_id: dict[str, LegalAssessmentRecord] = {}
        for row in rows:
            action_id = row.action_id
            if action_id in assessments_by_action_id:
                raise UpstreamApiError(
                    status_code=502,
                    message=(
                        "legal assessments S3 CSV returned duplicate action_id values "
                        f"for countryCode={normalized_country_code}"
                    ),
                    url=None,
                )
            assessments_by_action_id[action_id] = (
                _map_s3_csv_row_to_legal_assessment_record(
                    row=row,
                    country_code=normalized_country_code,
                    source_metadata=source_metadata,
                )
            )
        return assessments_by_action_id
