"""Repository data clients for file-backed and API-backed inputs."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from app.services.action_legal_assessments_api import (
    ActionLegalAssessmentsApiService,
    LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE,
)
from app.services.action_policy_scores_api import (
    ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
    ActionPolicyScoresApiService,
)
from app.services.city_attributes_api import CityAttributesApiService
from app.modules.prioritizer.internal_models import (
    Action,
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
    CityData,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.models import (
    ActionPolicyScoreApiItem,
    ActionPolicyScoresApiResponse,
    CityApiResponse,
    ActionsApiResponse,
    ActionLegalAssessmentApiItem,
    CitiesApiResponse,
)

logger = logging.getLogger(__name__)


def _base_source_metadata() -> dict[str, object]:
    """Return the canonical source-metadata shape used in artifacts."""
    return {
        "mock_file_path": None,
        "upstream_url": None,
        "upstream_endpoint": None,
        "http_status_code": None,
        "upstream_generated_at_utc": None,
    }


def describe_action_data_source(
    client: MockActionDataApiClient | ApiActionDataApiClient,
) -> dict[str, object]:
    """Return artifact-friendly source metadata for the configured action client."""
    if isinstance(client, MockActionDataApiClient):
        source_metadata = _base_source_metadata()
        source_metadata["mock_file_path"] = str(client.mock_file_path)
        return {
            "source": "mock_actions_api",
            "source_metadata": source_metadata,
        }
    return {
        "source": "actions_api",
        "source_metadata": _base_source_metadata(),
    }


def describe_legal_data_source(
    client: MockLegalDataApiClient | ApiLegalDataApiClient,
    *,
    country_code: str,
) -> dict[str, object]:
    """Return artifact-friendly source metadata for the configured legal client."""
    normalized_country_code = country_code.strip().upper()
    if hasattr(client, "mock_file_path"):
        source_metadata = _base_source_metadata()
        source_metadata["mock_file_path"] = str(getattr(client, "mock_file_path"))
        source_metadata["requested_country_code"] = normalized_country_code
        return {
            "source": "mock_action_legal_assessments_api",
            "source_metadata": source_metadata,
        }
    source_metadata = _base_source_metadata()
    source_metadata["requested_country_code"] = normalized_country_code
    service = getattr(client, "_service", None)
    if service is not None and hasattr(service, "_build_legal_assessments_url"):
        source_metadata["upstream_url"] = service._build_legal_assessments_url(
            normalized_country_code
        )
        source_metadata["upstream_endpoint"] = LEGAL_ASSESSMENTS_ENDPOINT_TEMPLATE
    return {
        "source": "action_legal_assessments_api",
        "source_metadata": source_metadata,
    }


@dataclass
class MockCityDataApiClient:
    """File-backed city client loading checked-in mock city API payload."""

    mock_file_path: Path

    def get_city(self, locode: str) -> CityData:
        """Load one city record from mock data by locode."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        if "cities" in payload:
            response_cities = CitiesApiResponse.model_validate(payload).cities
        elif "city" in payload:
            response_cities = [CityApiResponse.model_validate(payload).city]
        else:
            raise ValueError(
                "Invalid city mock payload: expected `city` or `cities` key"
            )
        requested_locode = locode.strip().upper()
        for city in response_cities:
            if city.locode.strip().upper() != requested_locode:
                continue
            # Keep full indicator fields so CityData can backfill city_context.
            city_raw = city.model_dump()
            city_for_validation = dict(city_raw)
            city_for_validation.update(
                {
                    "city_name": city.city_name,
                    "locode": city.locode,
                    "country_code": city.country_code,
                    "region_name": city.region_name,
                    "region_code": city.region_code,
                    "population_size": city.population_size,
                    "population_density": city.population_density,
                    "area_km2": city.area_km2,
                    "raw": city_raw,
                    "source": "mock_city_api",
                    "source_metadata": {
                        **_base_source_metadata(),
                        "mock_file_path": str(self.mock_file_path),
                        "requested_locode": requested_locode,
                    },
                }
            )
            return CityData.model_validate(city_for_validation)

        raise ValueError(f"Locode `{locode}` not found in city mock data")


@dataclass
class MockActionDataApiClient:
    """
    File-backed action client loading the checked-in mock actions API payload.

    The mock data is currently city-agnostic and returned as one shared action list.
    """

    mock_file_path: Path

    def list_actions(self) -> list[Action]:
        """Load and map mock action catalog rows into internal action models."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionsApiResponse.model_validate(payload)
        actions: list[Action] = []
        for action in response.actions:
            co_benefits = {
                impact_type: impact_entry.model_dump()
                for impact_type, impact_entry in action.coBenefits.items()
            }
            actions.append(
                Action(
                    action_id=action.actionId,
                    action_name=action.actionName,
                    biome=action.biome,
                    activity_type_description=action.activity_type_description,
                    description=action.description,
                    action_category=action.actionCategory,
                    action_subcategory=action.actionSubcategory,
                    investment_cost=action.costInvestmentNeeded,
                    implementation_timeline=action.timelineForImplementation,
                    emissions=(
                        action.emissions.model_dump()
                        if action.emissions is not None
                        else {}
                    ),
                    co_benefits=co_benefits,
                    socioeconomic_indicators=[
                        item.model_dump() for item in action.socioeconomicIndicators
                    ],
                    raw=action.model_dump(),
                )
            )
        return actions


@dataclass
class MockLegalDataApiClient:
    """
    File-backed legal client loading the checked-in mock legal API payload.

    The mock data is filtered by request country code and mapped by action ID.
    """

    mock_file_path: Path

    def get_action_legal_assessments(
        self, country_code: str
    ) -> dict[str, LegalAssessmentRecord]:
        """Load flat mock legal assessments grouped by action ID."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        assessment_rows = [
            ActionLegalAssessmentApiItem.model_validate(item) for item in payload
        ]
        assessments_by_action_id: dict[str, LegalAssessmentRecord] = {}
        for assessment in assessment_rows:
            if assessment.countryCode.strip().upper() != country_code.strip().upper():
                continue
            action_id = assessment.srcActionId
            if action_id in assessments_by_action_id:
                raise ValueError(
                    "Mock legal payload contains duplicate srcActionId values for "
                    f"countryCode={country_code.strip().upper()}"
                )
            assessment_raw = assessment.model_dump()
            assessments_by_action_id[action_id] = LegalAssessmentRecord.model_validate(
                {
                    "action_id": action_id,
                    "country_code": assessment.countryCode,
                    "gpc_sector": assessment.gpcSector,
                    "verdict_category": assessment.verdictCategory,
                    "verdict_score": assessment.verdictScore,
                    "ownership_category": assessment.ownershipCategory,
                    "ownership_score": assessment.ownershipScore,
                    "ownership_weight": assessment.ownershipWeight,
                    "ownership_description": assessment.ownershipDescription,
                    "restrictions_category": assessment.restrictionsCategory,
                    "restrictions_score": assessment.restrictionsScore,
                    "restrictions_weight": assessment.restrictionsWeight,
                    "restrictions_description": assessment.restrictionsDescription,
                    "legal_justification": assessment.legalJustification,
                    "analysis_date": assessment.analysisDate,
                    "generation_method": assessment.generationMethod,
                    "legal_references": assessment.legalReferences,
                    "release_id": assessment.releaseId,
                    "created_at": assessment.createdAt,
                    "updated_at": assessment.updatedAt,
                    "ownership_description_i18n": assessment.ownershipDescriptionI18n,
                    "restrictions_description_i18n": assessment.restrictionsDescriptionI18n,
                    "legal_justification_i18n": assessment.legalJustificationI18n,
                    "raw": assessment_raw,
                    "source_metadata": {
                        **_base_source_metadata(),
                        "mock_file_path": str(self.mock_file_path),
                        "requested_country_code": country_code.strip().upper(),
                    },
                }
            )
        return assessments_by_action_id


def _map_action_policy_score_item(
    *,
    score: ActionPolicyScoreApiItem,
    source_metadata: dict[str, object],
) -> ActionPolicyScoreRecord:
    """Map one upstream policy score item into the internal action-keyed record."""
    score_raw = score.model_dump(mode="json")
    return ActionPolicyScoreRecord.model_validate(
        {
            "action_id": score.src_action_id,
            "policy_support_score": score.policy_support_score,
            "policy_support_category": score.policy_support_category,
            "best_relevance": score.best_relevance,
            "n_findings": score.n_findings,
            "n_docs": score.n_docs,
            "sum_strength": score.sum_strength,
            "policy_evidence": [
                evidence.model_dump(mode="json") for evidence in score.policy_evidence
            ],
            "raw": score_raw,
            "source_metadata": source_metadata,
        }
    )


@dataclass
class MockActionPolicyScoresDataApiClient:
    """File-backed action policy scores client loading checked-in mock payload."""

    mock_file_path: Path

    def get_action_policy_scores(
        self, locode: str
    ) -> ActionPolicyScoresFetchResult:
        """Load action policy scores grouped by action ID."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionPolicyScoresApiResponse.model_validate(payload)
        requested_locode = locode.strip().upper()
        response_meta = response.meta.model_dump(mode="json")
        source_metadata = {
            **_base_source_metadata(),
            "mock_file_path": str(self.mock_file_path),
            "requested_locode": requested_locode,
            "upstream_endpoint": ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
            "upstream_generated_at_utc": response.meta.generated_at_utc,
        }
        scores_by_action_id: dict[str, ActionPolicyScoreRecord] = {}
        for score in response.scores:
            action_id = score.src_action_id
            if action_id in scores_by_action_id:
                raise ValueError(
                    "Mock action policy scores payload contains duplicate "
                    f"src_action_id values for locode={requested_locode}"
                )
            scores_by_action_id[action_id] = _map_action_policy_score_item(
                score=score,
                source_metadata=source_metadata,
            )
        return ActionPolicyScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response_meta,
            warning=None,
        )


class ApiLegalDataApiClient:
    """API-backed legal client using the flat upstream legal assessments service."""

    def __init__(
        self, service: ActionLegalAssessmentsApiService | None = None
    ) -> None:
        """Create the legal API client with a small synchronous service wrapper."""
        self._service = service or ActionLegalAssessmentsApiService()

    def get_action_legal_assessments(
        self, country_code: str
    ) -> dict[str, LegalAssessmentRecord]:
        """Fetch country-scoped legal assessments from the upstream legal API."""
        return self._service.get_assessments_by_action_id(country_code)


class ApiActionPolicyScoresDataApiClient:
    """API-backed policy client using the upstream action policy scores service."""

    def __init__(self, service: ActionPolicyScoresApiService | None = None) -> None:
        """Create the policy API client with a small synchronous service wrapper."""
        self._service = service or ActionPolicyScoresApiService()

    def get_action_policy_scores(
        self, locode: str
    ) -> ActionPolicyScoresFetchResult:
        """Fetch city-scoped action policy scores from the upstream policy API."""
        return self._service.get_scores_by_action_id(locode)


class ApiActionDataApiClient:
    """
    Placeholder action client for future upstream HTTP integration.

    Current behavior fails fast until real HTTP integration is implemented.
    """

    def list_actions(self) -> list[Action]:
        """Raise until actions API integration is implemented."""
        raise NotImplementedError(
            "ApiActionDataApiClient is not implemented yet. "
            "Set HIAP_MEED_ACTION_DATA_SOURCE=mock for local runs."
        )


class ApiCityDataApiClient:
    """
    Placeholder city client for future upstream HTTP integration.

    Current behavior fails fast until real HTTP integration is implemented.
    """

    def __init__(self, service: CityAttributesApiService | None = None) -> None:
        """Create the city API client with a small synchronous service wrapper."""
        self._service = service or CityAttributesApiService()

    def get_city(self, locode: str) -> CityData:
        """Fetch city context from the upstream city attributes API."""
        return self._service.get_city(locode)


_default_api_city_client = ApiCityDataApiClient()
_default_mock_city_client = MockCityDataApiClient(
    mock_file_path=Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "city_api_mock.json"
)
_default_api_action_client = ApiActionDataApiClient()
_default_mock_action_client = MockActionDataApiClient(
    mock_file_path=Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "actions_api_mock.json"
)
_default_api_legal_client = ApiLegalDataApiClient()
_default_mock_legal_client = MockLegalDataApiClient(
    mock_file_path=Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "actions_legal_api_mock.json"
)
_default_action_policy_scores_mock_file_path = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "action_policy_scores_api_mock.json"
)
_default_api_action_policy_scores_client = ApiActionPolicyScoresDataApiClient()
_default_mock_action_policy_scores_client = MockActionPolicyScoresDataApiClient(
    mock_file_path=_default_action_policy_scores_mock_file_path
)


def get_city_data_api_client() -> MockCityDataApiClient | ApiCityDataApiClient:
    """FastAPI dependency provider for city data client."""
    source = os.getenv("HIAP_MEED_CITY_DATA_SOURCE", "api").strip().lower()
    if source == "api":
        return _default_api_city_client

    if not _default_mock_city_client.mock_file_path.exists():
        logger.warning(
            "Mock city file not found at `%s`; using API city client",
            _default_mock_city_client.mock_file_path,
        )
        return _default_api_city_client

    if source not in {"mock", "api"}:
        logger.warning(
            "Unknown HIAP_MEED_CITY_DATA_SOURCE=`%s`; using mock city client", source
        )
    return _default_mock_city_client


def get_action_data_api_client() -> MockActionDataApiClient | ApiActionDataApiClient:
    """FastAPI dependency provider for action catalog client."""
    source = os.getenv("HIAP_MEED_ACTION_DATA_SOURCE", "mock").strip().lower()
    if source == "api":
        return _default_api_action_client

    if not _default_mock_action_client.mock_file_path.exists():
        logger.warning(
            "Mock actions file not found at `%s`; using API action client",
            _default_mock_action_client.mock_file_path,
        )
        return _default_api_action_client

    if source not in {"mock", "api"}:
        logger.warning(
            "Unknown HIAP_MEED_ACTION_DATA_SOURCE=`%s`; using mock action client",
            source,
        )
    return _default_mock_action_client


def get_legal_data_api_client() -> MockLegalDataApiClient | ApiLegalDataApiClient:
    """FastAPI dependency provider for legal assessment client."""
    source = os.getenv("HIAP_MEED_LEGAL_DATA_SOURCE", "api").strip().lower()
    if source == "api":
        return _default_api_legal_client

    if not _default_mock_legal_client.mock_file_path.exists():
        logger.warning(
            "Mock legal file not found at `%s`; using API legal client",
            _default_mock_legal_client.mock_file_path,
        )
        return _default_api_legal_client

    if source not in {"mock", "api"}:
        logger.warning(
            "Unknown HIAP_MEED_LEGAL_DATA_SOURCE=`%s`; using mock legal client",
            source,
        )
    return _default_mock_legal_client


def get_action_policy_scores_data_api_client() -> (
    MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
):
    """FastAPI dependency provider for action policy scores client."""
    source = os.getenv("HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE", "api").strip().lower()
    if source == "api":
        return _default_api_action_policy_scores_client

    if not _default_action_policy_scores_mock_file_path.exists():
        logger.warning(
            "Mock action policy scores file not found at `%s`; using API action policy scores client",
            _default_action_policy_scores_mock_file_path,
        )
        return _default_api_action_policy_scores_client

    if source not in {"mock", "api"}:
        logger.warning(
            "Unknown HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE=`%s`; using mock action policy scores client",
            source,
        )
    return _default_mock_action_policy_scores_client
