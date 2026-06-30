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
from app.services.action_financial_feasibility_scores_api import (
    ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
    ActionFinancialFeasibilityScoresApiService,
)
from app.services.action_mitigation_feasibility_scores_api import (
    ACTION_MITIGATION_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
    ActionMitigationFeasibilityScoresApiService,
)
from app.services.action_pathways_api import (
    ACTION_PATHWAYS_ENDPOINT,
    ActionPathwaysApiService,
    map_action_pathway_api_item_to_action,
)
from app.services.action_policy_scores_api import (
    ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
    ActionPolicyScoresApiService,
)
from app.services.city_attributes_api import CityAttributesApiService
from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionFinancialFeasibilityScoresFetchResult,
    ActionPathwaysFetchResult,
    ActionMitigationFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoresFetchResult,
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
    CityData,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.models import (
    ActionFinancialFeasibilityScoreApiItem,
    ActionFinancialFeasibilityScoresApiResponse,
    ActionMitigationFeasibilityScoreApiItem,
    ActionMitigationFeasibilityScoresApiResponse,
    ActionPolicyScoreApiItem,
    ActionPolicyScoresApiResponse,
    CityApiResponse,
    ActionPathwaysApiResponse,
    ActionLegalAssessmentApiItem,
    CitiesApiResponse,
)

logger = logging.getLogger(__name__)


def _resolve_configured_data_source(env_var_name: str, default: str = "api") -> str:
    """Return a validated data-source mode from the environment."""
    source = os.getenv(env_var_name, default).strip().lower()
    if source in {"mock", "api"}:
        return source
    logger.error(
        "Invalid %s=`%s`; expected one of: api, mock",
        env_var_name,
        source,
    )
    raise ValueError(
        f"Invalid {env_var_name}=`{source}`; expected one of: api, mock"
    )


def _base_source_metadata() -> dict[str, object]:
    """Return the canonical source-metadata shape used in artifacts."""
    return {
        "mock_file_path": None,
        "upstream_url": None,
        "upstream_endpoint": None,
        "http_status_code": None,
        "upstream_generated_at_utc": None,
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
        response_meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
        for city in response_cities:
            if city.locode.strip().upper() != requested_locode:
                continue
            # Keep full indicator fields so CityData can backfill city_context.
            city_raw = city.model_dump(mode="json")
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
                        "requested_version_label": None,
                        "upstream_generated_at_utc": response_meta.get(
                            "generated_at_utc"
                        ),
                        "upstream_api_context": response_meta.get("api_context"),
                        "upstream_datasources": response_meta.get("datasources", []),
                    },
                }
            )
            return CityData.model_validate(city_for_validation)

        raise ValueError(f"Locode `{locode}` not found in city mock data")


@dataclass
class MockActionPathwaysDataApiClient:
    """
    File-backed action client loading the checked-in mock actions API payload.

    The mock data is currently city-agnostic and returned as one shared action list.
    """

    mock_file_path: Path

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Load and map the full mock action pathways catalog."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionPathwaysApiResponse.model_validate(payload)
        source_metadata = {
            **_base_source_metadata(),
            "mock_file_path": str(self.mock_file_path),
            "upstream_endpoint": ACTION_PATHWAYS_ENDPOINT,
            "upstream_generated_at_utc": response.meta.generated_at_utc,
        }
        return ActionPathwaysFetchResult(
            actions=[
                map_action_pathway_api_item_to_action(action)
                for action in response.actions
            ],
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
            warning=None,
        )


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
            if assessment.country_code.strip().upper() != country_code.strip().upper():
                continue
            action_id = assessment.src_action_id
            if action_id in assessments_by_action_id:
                raise ValueError(
                    "Mock legal payload contains duplicate src_action_id values for "
                    f"countryCode={country_code.strip().upper()}"
                )
            assessment_raw = assessment.model_dump()
            assessments_by_action_id[action_id] = LegalAssessmentRecord.model_validate(
                {
                    "action_id": action_id,
                    "country_code": assessment.country_code,
                    "gpc_sector": assessment.gpc_sector,
                    "verdict_category": assessment.verdict_category,
                    "verdict_score": assessment.verdict_score,
                    "ownership_category": assessment.ownership_category,
                    "ownership_score": assessment.ownership_score,
                    "ownership_weight": assessment.ownership_weight,
                    "ownership_description": assessment.ownership_description,
                    "restrictions_category": assessment.restrictions_category,
                    "restrictions_score": assessment.restrictions_score,
                    "restrictions_weight": assessment.restrictions_weight,
                    "restrictions_description": assessment.restrictions_description,
                    "legal_justification": assessment.legal_justification,
                    "analysis_date": assessment.analysis_date,
                    "generation_method": assessment.generation_method,
                    "legal_references": assessment.legal_references,
                    "release_id": assessment.release_id,
                    "created_at": assessment.created_at,
                    "updated_at": assessment.updated_at,
                    "ownership_description_i18n": assessment.ownership_description_i18n,
                    "restrictions_description_i18n": assessment.restrictions_description_i18n,
                    "legal_justification_i18n": assessment.legal_justification_i18n,
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


def _map_action_mitigation_feasibility_score_item(
    *,
    score: ActionMitigationFeasibilityScoreApiItem,
    source_metadata: dict[str, object],
) -> ActionMitigationFeasibilityScoreRecord:
    """Map one upstream feasibility score item into the internal action-keyed record."""
    score_raw = score.model_dump(mode="json")
    return ActionMitigationFeasibilityScoreRecord.model_validate(
        {
            "action_id": score.src_action_id,
            "locode": score.locode,
            "global_mitigation_option": score.global_mitigation_option,
            "action_mapping_strength": score.action_mapping_strength,
            "option_family": score.option_family,
            "action_score": score.action_score,
            "n_feasibility_dimensions": score.n_feasibility_dimensions,
            "dimension_scores": score.dimension_scores,
            "breakdown": score.breakdown,
            "rank_within_city": score.rank_within_city,
            "raw": score_raw,
            "source_metadata": source_metadata,
        }
    )


def _map_action_financial_feasibility_score_item(
    *,
    score: ActionFinancialFeasibilityScoreApiItem,
    source_metadata: dict[str, object],
) -> ActionFinancialFeasibilityScoreRecord:
    """Map one upstream financial feasibility item into the action-keyed record."""
    score_raw = score.model_dump(mode="json")
    return ActionFinancialFeasibilityScoreRecord.model_validate(
        {
            "action_id": score.action_id,
            "action_name": score.action_name,
            "sector": score.sector,
            "financial_feasibility": score.financial_feasibility,
            "route": score.route,
            "reason": score.reason,
            "inputs": score.inputs,
            "links": score.links,
            "raw": score_raw,
            "source_metadata": source_metadata,
        }
    )


@dataclass
class MockActionMitigationFeasibilityScoresDataApiClient:
    """File-backed mitigation feasibility scores client loading mock payload."""

    mock_file_path: Path

    def get_action_mitigation_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Load mitigation feasibility scores grouped by action ID."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionMitigationFeasibilityScoresApiResponse.model_validate(payload)
        requested_locode = locode.strip().upper()
        requested_country_code = country_code.strip().upper()
        source_metadata = {
            **_base_source_metadata(),
            "mock_file_path": str(self.mock_file_path),
            "requested_locode": requested_locode,
            "requested_country_code": requested_country_code,
            "upstream_endpoint": ACTION_MITIGATION_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
            "upstream_generated_at_utc": response.meta.generated_at_utc,
        }
        scores_by_action_id: dict[str, ActionMitigationFeasibilityScoreRecord] = {}
        for score in response.scores:
            action_id = score.src_action_id
            if action_id in scores_by_action_id:
                raise ValueError(
                    "Mock action mitigation feasibility scores payload contains duplicate "
                    f"src_action_id values for locode={requested_locode}"
                )
            scores_by_action_id[action_id] = (
                _map_action_mitigation_feasibility_score_item(
                    score=score,
                    source_metadata=source_metadata,
                )
            )
        return ActionMitigationFeasibilityScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
            warning=None,
        )


@dataclass
class MockActionFinancialFeasibilityScoresDataApiClient:
    """File-backed financial feasibility scores client loading mock payload."""

    mock_file_path: Path

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Load financial feasibility scores grouped by action ID."""
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionFinancialFeasibilityScoresApiResponse.model_validate(payload)
        requested_locode = locode.strip().upper()
        requested_country_code = country_code.strip().upper()
        source_metadata = {
            **_base_source_metadata(),
            "mock_file_path": str(self.mock_file_path),
            "requested_locode": requested_locode,
            "requested_country_code": requested_country_code,
            "upstream_endpoint": ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
            "upstream_generated_at_utc": response.meta.generated_at_utc,
        }
        scores_by_action_id: dict[str, ActionFinancialFeasibilityScoreRecord] = {}
        for score in response.data:
            action_id = score.action_id
            if action_id in scores_by_action_id:
                raise ValueError(
                    "Mock action financial feasibility scores payload contains duplicate "
                    f"action_id values for locode={requested_locode}"
                )
            scores_by_action_id[action_id] = (
                _map_action_financial_feasibility_score_item(
                    score=score,
                    source_metadata=source_metadata,
                )
            )
        return ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
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


class ApiActionMitigationFeasibilityScoresDataApiClient:
    """API-backed feasibility client using the upstream score service."""

    def __init__(
        self, service: ActionMitigationFeasibilityScoresApiService | None = None
    ) -> None:
        """Create the feasibility API client with a small synchronous service wrapper."""
        self._service = service or ActionMitigationFeasibilityScoresApiService()

    def get_action_mitigation_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionMitigationFeasibilityScoresFetchResult:
        """Fetch city-scoped mitigation feasibility scores from the upstream API."""
        return self._service.get_scores_by_action_id(locode, country_code)


class ApiActionFinancialFeasibilityScoresDataApiClient:
    """API-backed financial feasibility client using the upstream score service."""

    def __init__(
        self, service: ActionFinancialFeasibilityScoresApiService | None = None
    ) -> None:
        """Create the financial feasibility API client with a service wrapper."""
        self._service = service or ActionFinancialFeasibilityScoresApiService()

    def get_action_financial_feasibility_scores(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Fetch city-scoped financial feasibility scores from the upstream API."""
        return self._service.get_scores_by_action_id(locode, country_code)


class ApiActionPathwaysDataApiClient:
    """API-backed action catalog client using the upstream action pathways service."""

    def __init__(self, service: ActionPathwaysApiService | None = None) -> None:
        """Create the action API client with a small synchronous service wrapper."""
        self._service = service or ActionPathwaysApiService()

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Fetch the full action pathways catalog from the upstream action API."""
        return self._service.list_actions()


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
_default_api_action_client = ApiActionPathwaysDataApiClient()
_default_mock_action_client = MockActionPathwaysDataApiClient(
    mock_file_path=Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "action_pathways_api_mock.json"
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
_default_action_mitigation_feasibility_scores_mock_file_path = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "action_mitigation_feasibility_scores_api_mock.json"
)
_default_api_action_mitigation_feasibility_scores_client = (
    ApiActionMitigationFeasibilityScoresDataApiClient()
)
_default_mock_action_mitigation_feasibility_scores_client = (
    MockActionMitigationFeasibilityScoresDataApiClient(
        mock_file_path=_default_action_mitigation_feasibility_scores_mock_file_path
    )
)
_default_action_financial_feasibility_scores_mock_file_path = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "action_financial_feasibility_scores_api_mock.json"
)
_default_api_action_financial_feasibility_scores_client = (
    ApiActionFinancialFeasibilityScoresDataApiClient()
)
_default_mock_action_financial_feasibility_scores_client = (
    MockActionFinancialFeasibilityScoresDataApiClient(
        mock_file_path=_default_action_financial_feasibility_scores_mock_file_path
    )
)


def get_city_data_api_client() -> MockCityDataApiClient | ApiCityDataApiClient:
    """FastAPI dependency provider for city data client."""
    source = _resolve_configured_data_source("HIAP_MEED_CITY_DATA_SOURCE")
    if source == "api":
        return _default_api_city_client

    if not _default_mock_city_client.mock_file_path.exists():
        logger.warning(
            "Mock city file not found at `%s`; using API city client",
            _default_mock_city_client.mock_file_path,
        )
        return _default_api_city_client

    return _default_mock_city_client


def get_action_pathways_data_api_client() -> MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient:
    """FastAPI dependency provider for action catalog client."""
    source = _resolve_configured_data_source("HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE")
    if source == "api":
        return _default_api_action_client

    if not _default_mock_action_client.mock_file_path.exists():
        logger.warning(
            "Mock actions file not found at `%s`; using API action client",
            _default_mock_action_client.mock_file_path,
        )
        return _default_api_action_client

    return _default_mock_action_client


def get_legal_data_api_client() -> MockLegalDataApiClient | ApiLegalDataApiClient:
    """FastAPI dependency provider for legal assessment client."""
    source = _resolve_configured_data_source("HIAP_MEED_LEGAL_DATA_SOURCE")
    if source == "api":
        return _default_api_legal_client

    if not _default_mock_legal_client.mock_file_path.exists():
        logger.warning(
            "Mock legal file not found at `%s`; using API legal client",
            _default_mock_legal_client.mock_file_path,
        )
        return _default_api_legal_client

    return _default_mock_legal_client


def get_action_policy_scores_data_api_client() -> (
    MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
):
    """FastAPI dependency provider for action policy scores client."""
    source = _resolve_configured_data_source(
        "HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE"
    )
    if source == "api":
        return _default_api_action_policy_scores_client

    if not _default_action_policy_scores_mock_file_path.exists():
        logger.warning(
            "Mock action policy scores file not found at `%s`; "
            "using API action policy scores client",
            _default_action_policy_scores_mock_file_path,
        )
        return _default_api_action_policy_scores_client

    return _default_mock_action_policy_scores_client


def get_action_mitigation_feasibility_scores_data_api_client() -> (
    MockActionMitigationFeasibilityScoresDataApiClient
    | ApiActionMitigationFeasibilityScoresDataApiClient
):
    """FastAPI dependency provider for mitigation feasibility scores client."""
    source = _resolve_configured_data_source(
        "HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE"
    )
    if source == "api":
        return _default_api_action_mitigation_feasibility_scores_client

    if not _default_action_mitigation_feasibility_scores_mock_file_path.exists():
        logger.warning(
            "Mock action mitigation feasibility scores file not found at `%s`; "
            "using API action mitigation feasibility scores client",
            _default_action_mitigation_feasibility_scores_mock_file_path,
        )
        return _default_api_action_mitigation_feasibility_scores_client

    return _default_mock_action_mitigation_feasibility_scores_client


def get_action_financial_feasibility_scores_data_api_client() -> (
    MockActionFinancialFeasibilityScoresDataApiClient
    | ApiActionFinancialFeasibilityScoresDataApiClient
):
    """FastAPI dependency provider for financial feasibility scores client."""
    source = _resolve_configured_data_source(
        "HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE"
    )
    if source == "api":
        return _default_api_action_financial_feasibility_scores_client

    if not _default_action_financial_feasibility_scores_mock_file_path.exists():
        logger.warning(
            "Mock action financial feasibility scores file not found at `%s`; "
            "using API action financial feasibility scores client",
            _default_action_financial_feasibility_scores_mock_file_path,
        )
        return _default_api_action_financial_feasibility_scores_client

    return _default_mock_action_financial_feasibility_scores_client

