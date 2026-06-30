"""Live contract checks for the implemented upstream legal assessments API path."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import ActionLegalAssessmentApiItem
from app.services.action_legal_assessments_api import (
    ActionLegalAssessmentsApiService,
    LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE,
)
from app.services.http_client import get_json_list_with_retries

EXPECTED_VERDICT_CATEGORIES = {"enabled", "conditional", "blocked"}
EXPECTED_DIMENSION_CATEGORIES = {"enabled", "conditional", "blocked"}

EXPECTED_LEGAL_KEYS = {
    "legalAnalysisId",
    "srcActionId",
    "countryCode",
    "gpcSector",
    "verdictCategory",
    "verdictScore",
    "ownershipCategory",
    "ownershipScore",
    "ownershipWeight",
    "ownershipDescription",
    "restrictionsCategory",
    "restrictionsScore",
    "restrictionsWeight",
    "restrictionsDescription",
    "legalJustification",
    "analysisDate",
    "generationMethod",
    "legalReferences",
    "releaseId",
    "createdAt",
    "updatedAt",
    "ownershipDescriptionI18n",
    "restrictionsDescriptionI18n",
    "legalJustificationI18n",
}


def _xfail_if_live_legal_endpoint_is_empty(payload: list[object]) -> None:
    """Mark the live legal contract checks as expected-fail while the upstream endpoint is empty."""
    if not payload:
        pytest.xfail(
            "Live legal endpoint currently returns HTTP 200 with an empty payload. "
            "The legal data source needs to migrate to a replacement endpoint, "
            "and these strict live assertions should be reinstated once that endpoint is wired."
        )


def _assert_i18n_map(value: object, field_name: str) -> None:
    """Assert one legal i18n payload is a string-to-string mapping."""
    assert isinstance(value, dict), field_name
    for locale, text in value.items():
        assert isinstance(locale, str), field_name
        assert locale, field_name
        assert isinstance(text, str), field_name


def _assert_optional_score(value: object, field_name: str) -> None:
    """Assert one optional score stays within the normalized `0..1` range."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert 0.0 <= float(value) <= 1.0, field_name


def _assert_optional_weight(value: object, field_name: str) -> None:
    """Assert one optional weight is numeric and normalized when present."""
    assert value is None or isinstance(value, (int, float)), field_name
    if value is not None:
        assert 0.0 <= float(value) <= 1.0, field_name


def _assert_live_legal_row_shape(row: dict[str, object]) -> None:
    """Assert one live legal row keeps the fields that drive filtering and scoring."""
    assert EXPECTED_LEGAL_KEYS.issubset(row.keys())
    assert isinstance(row["legalAnalysisId"], str)
    assert row["legalAnalysisId"]
    assert isinstance(row["srcActionId"], str)
    assert row["srcActionId"]
    assert row["countryCode"] == "CL"
    assert row["gpcSector"] is None or isinstance(row["gpcSector"], str)

    verdict_category = row["verdictCategory"]
    assert verdict_category is None or verdict_category in EXPECTED_VERDICT_CATEGORIES
    _assert_optional_score(row["verdictScore"], "verdictScore")

    ownership_category = row["ownershipCategory"]
    assert (
        ownership_category is None
        or ownership_category in EXPECTED_DIMENSION_CATEGORIES
    )
    _assert_optional_score(row["ownershipScore"], "ownershipScore")
    _assert_optional_weight(row["ownershipWeight"], "ownershipWeight")
    assert row["ownershipDescription"] is None or isinstance(
        row["ownershipDescription"], str
    )

    restrictions_category = row["restrictionsCategory"]
    assert (
        restrictions_category is None
        or restrictions_category in EXPECTED_DIMENSION_CATEGORIES
    )
    _assert_optional_score(row["restrictionsScore"], "restrictionsScore")
    _assert_optional_weight(row["restrictionsWeight"], "restrictionsWeight")
    assert row["restrictionsDescription"] is None or isinstance(
        row["restrictionsDescription"], str
    )

    if row["ownershipWeight"] is not None and row["restrictionsWeight"] is not None:
        assert float(row["ownershipWeight"]) + float(row["restrictionsWeight"]) == (
            pytest.approx(1.0)
        )

    assert row["legalJustification"] is None or isinstance(row["legalJustification"], str)
    assert row["analysisDate"] is None or isinstance(row["analysisDate"], str)
    assert row["generationMethod"] is None or isinstance(row["generationMethod"], str)
    assert row["releaseId"] is None or isinstance(row["releaseId"], str)
    assert row["createdAt"] is None or isinstance(row["createdAt"], str)
    assert row["updatedAt"] is None or isinstance(row["updatedAt"], str)

    legal_references = row["legalReferences"]
    assert isinstance(legal_references, list)
    for reference in legal_references:
        assert isinstance(reference, str)
        assert reference

    _assert_i18n_map(row["ownershipDescriptionI18n"], "ownershipDescriptionI18n")
    _assert_i18n_map(row["restrictionsDescriptionI18n"], "restrictionsDescriptionI18n")
    _assert_i18n_map(row["legalJustificationI18n"], "legalJustificationI18n")


@pytest.mark.integration
@pytest.mark.external
def test_legal_assessments_live_payload_matches_expected_contract() -> None:
    """The live upstream legal payload keeps the flat contract our service implements."""
    service = ActionLegalAssessmentsApiService()
    url = service._build_legal_assessments_url("CL")

    payload, status_code = get_json_list_with_retries(
        url=url,
        operation_name="legal assessments API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert isinstance(payload, list)
    _xfail_if_live_legal_endpoint_is_empty(payload)
    assert payload

    first_row = payload[0]
    _assert_live_legal_row_shape(first_row)
    for row in payload:
        _assert_live_legal_row_shape(row)

    validated = [ActionLegalAssessmentApiItem.model_validate(row) for row in payload]
    assert validated
    assert validated[0].country_code == "CL"


@pytest.mark.integration
@pytest.mark.external
def test_legal_assessments_live_service_maps_current_upstream_payload() -> None:
    """The synchronous legal service maps the live upstream payload into internal records."""
    assessments = ActionLegalAssessmentsApiService().get_assessments_by_action_id("CL")

    if not assessments:
        pytest.xfail(
            "Live legal endpoint currently returns no legal rows for CL. "
            "Migrate the legal client to the replacement endpoint, then restore this strict mapping assertion."
        )
    assert assessments
    assert "c40_0010" in assessments
    first_assessment = assessments["c40_0010"]
    assert first_assessment.action_id == "c40_0010"
    assert first_assessment.country_code == "CL"
    assert first_assessment.verdict_category in EXPECTED_VERDICT_CATEGORIES
    assert first_assessment.verdict_score is None or (
        0.0 <= first_assessment.verdict_score <= 1.0
    )
    assert first_assessment.ownership_category in EXPECTED_DIMENSION_CATEGORIES
    assert first_assessment.ownership_score is None or (
        0.0 <= first_assessment.ownership_score <= 1.0
    )
    assert first_assessment.restrictions_category in EXPECTED_DIMENSION_CATEGORIES
    assert first_assessment.restrictions_score is None or (
        0.0 <= first_assessment.restrictions_score <= 1.0
    )
    if (
        first_assessment.ownership_weight is not None
        and first_assessment.restrictions_weight is not None
    ):
        assert (
            first_assessment.ownership_weight + first_assessment.restrictions_weight
            == pytest.approx(1.0)
        )
    assert isinstance(first_assessment.legal_references, list)
    assert isinstance(first_assessment.ownership_description_i18n, dict)
    assert isinstance(first_assessment.restrictions_description_i18n, dict)
    assert isinstance(first_assessment.legal_justification_i18n, dict)
    assert first_assessment.source_metadata["requested_country_code"] == "CL"
    assert first_assessment.source_metadata["upstream_endpoint"] == (
        LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE
    )
    assert first_assessment.source_metadata["http_status_code"] == 200
