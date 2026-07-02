"""Integration contract checks for the S3-backed legal assessments source."""

from __future__ import annotations

import csv
import os
from io import BytesIO, StringIO

import pytest

from app.services.action_legal_assessments_s3 import (
    DEFAULT_LEGAL_S3_BUCKET,
    DEFAULT_LEGAL_S3_KEY,
    LEGAL_ASSESSMENTS_S3_ENDPOINT,
    ActionLegalAssessmentsS3Service,
)
from app.services.data_clients import S3LegalDataApiClient

EXPECTED_REQUIRED_HEADERS = {
    "action_id",
    "verdict_category",
    "verdict_score",
    "ownership_category",
    "ownership_score",
    "ownership_weight",
    "ownership_description",
    "restrictions_category",
    "restrictions_score",
    "restrictions_weight",
    "restrictions_description",
    "legal_justification",
    "legal_justification_en",
    "legal_reference_1",
    "legal_reference_2",
    "legal_reference_3",
    "legal_reference_4",
    "legal_reference_5",
    "legal_reference_6",
}


def _required_env_value(name: str) -> str:
    """Return a required environment value for live S3 tests."""
    value = os.getenv(name)
    if value is None or not value.strip():
        pytest.fail(
            f"{name} must be set for live S3 legal tests; AWS CLI profiles are "
            "intentionally ignored"
        )
    return value.strip()


def _explicit_env_s3_client() -> object:
    """Create an S3 client from explicit env credentials only."""
    import boto3

    region_name = (
        os.getenv("AWS_REGION")
        or os.getenv("AWS_DEFAULT_REGION")
        or os.getenv("HIAP_MEED_LEGAL_S3_REGION")
        or "us-east-1"
    )
    return boto3.client(
        "s3",
        aws_access_key_id=_required_env_value("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=_required_env_value("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN") or None,
        region_name=region_name.strip(),
    )


class FakeS3Client:
    """Minimal S3 fake returning a representative legal classification CSV."""

    def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
        """Return a deterministic S3 CSV object without network access."""
        csv_text = (
            "action_id,sector,verdict_category,verdict_score,"
            "ownership_category,ownership_score,ownership_weight,"
            "ownership_description,ownership_description_es,"
            "restrictions_category,restrictions_score,restrictions_weight,"
            "restrictions_description,restrictions_description_es,"
            "legal_justification,legal_justification_en,"
            "legal_reference_1,legal_reference_2,legal_reference_3,"
            "legal_reference_4,legal_reference_5,legal_reference_6,"
            "analysis_date,generation_method,publisher_id\n"
            'c40_0010,stationary_energy,conditional,0.5,enabled,1,0.67,'
            '"Authority exists.","La autoridad existe.",conditional,0.5,0.33,'
            '"Moderate risk.","Riesgo moderado.",'
            '"Justificacion legal.","Legal justification.",'
            '"Law 1",,"Law 3",,,,2026-04-30,expert review,publisher-1\n'
            'c40_0013,transportation,blocked,0,blocked,0,0.67,'
            '"No authority.","Sin autoridad.",blocked,0,0.33,'
            '"Blocking restriction.","Restriccion bloqueante.",'
            '"No habilitado.","Not enabled.",'
            '"Law 4",,,,,,2026-04-30,expert review,publisher-1\n'
        )
        return {"Body": BytesIO(csv_text.encode("utf-8"))}


@pytest.mark.integration
def test_s3_legal_client_preserves_filtering_and_scoring_contract() -> None:
    """S3 client returns the existing action-keyed legal assessment contract."""
    service = ActionLegalAssessmentsS3Service(
        bucket="legal-bucket",
        key="legal/classification.csv",
        s3_client=FakeS3Client(),
    )
    client = S3LegalDataApiClient(service=service)

    assessments = client.get_action_legal_assessments("CL")

    assert set(assessments) == {"c40_0010", "c40_0013"}
    assert assessments["c40_0010"].verdict_category == "conditional"
    assert assessments["c40_0010"].verdict_score == pytest.approx(0.5)
    assert assessments["c40_0010"].legal_references == ["Law 1", "Law 3"]
    assert assessments["c40_0013"].verdict_category == "blocked"
    assert assessments["c40_0013"].verdict_score == pytest.approx(0.0)


@pytest.mark.integration
def test_s3_legal_csv_fixture_includes_required_headers() -> None:
    """Representative S3 CSV headers cover fields used by legal scoring."""
    csv_text = FakeS3Client().get_object(
        Bucket="legal-bucket",
        Key="legal/classification.csv",
    )["Body"].read().decode("utf-8")
    header_line = csv_text.splitlines()[0]

    assert EXPECTED_REQUIRED_HEADERS.issubset(set(header_line.split(",")))


@pytest.mark.integration
@pytest.mark.external
def test_legal_assessments_live_s3_object_matches_expected_contract() -> None:
    """The configured live S3 CSV is reachable and keeps required headers."""
    service = ActionLegalAssessmentsS3Service(s3_client=_explicit_env_s3_client())

    csv_text, object_metadata = service._download_csv_text()

    reader = csv.DictReader(StringIO(csv_text))
    assert reader.fieldnames is not None
    assert EXPECTED_REQUIRED_HEADERS.issubset(set(reader.fieldnames))
    first_row = next(reader)
    assert isinstance(first_row["action_id"], str)
    assert first_row["action_id"]
    assert object_metadata["etag"] is not None


@pytest.mark.integration
@pytest.mark.external
def test_legal_assessments_live_s3_service_maps_payload() -> None:
    """The S3 legal service maps the live CSV into internal legal records."""
    service = ActionLegalAssessmentsS3Service(
        bucket=DEFAULT_LEGAL_S3_BUCKET,
        key=DEFAULT_LEGAL_S3_KEY,
        s3_client=_explicit_env_s3_client(),
    )

    assessments = service.get_assessments_by_action_id("CL")

    assert assessments
    first_assessment = assessments[sorted(assessments.keys())[0]]
    assert first_assessment.action_id
    assert first_assessment.country_code == "CL"
    assert first_assessment.source_metadata["source_type"] == "s3_csv"
    assert first_assessment.source_metadata["upstream_endpoint"] == (
        LEGAL_ASSESSMENTS_S3_ENDPOINT
    )
    assert first_assessment.source_metadata["etag"] is not None
