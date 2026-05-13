"""Repository data clients for file-backed and API-backed inputs."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from app.services.city_attributes_api import CityAttributesApiService
from app.modules.prioritizer.internal_models import (
    Action,
    CityData,
    LegalRequirementRecord,
)
from app.modules.prioritizer.models import (
    ActionsPolicySignalsApiResponse,
    CityApiResponse,
    ActionsApiResponse,
    ActionsLegalApiResponse,
    CitiesApiResponse,
    PolicySignalByAction,
)

logger = logging.getLogger(__name__)


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

    The mock data is city-agnostic in this scaffold and returned for any locode.
    """

    mock_file_path: Path

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[LegalRequirementRecord]]:
        """Load mock legal requirements grouped by action ID."""
        _ = locode  # Locode is unused because mock legal payload is city-agnostic.
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionsLegalApiResponse.model_validate(payload)
        requirements_by_action_id: dict[str, list[LegalRequirementRecord]] = {}
        for action_group in response.legal_requirements:
            requirements_by_action_id[action_group.action_id] = [
                LegalRequirementRecord(
                    signal_code=requirement.signal_code,
                    signal_name=requirement.signal_name,
                    operator=requirement.operator,
                    required_value=requirement.required_value,
                    legal_signal_value=requirement.legal_signal_value,
                    strength=requirement.strength,
                    alignment_status=requirement.alignment_status,
                    location_scope=requirement.location_scope,
                    location_name=requirement.location_name,
                    evidence_ids=requirement.evidence_ids,
                    evidence_count=requirement.evidence_count,
                )
                for requirement in action_group.requirements
            ]
        return requirements_by_action_id


@dataclass
class MockPolicySignalsDataApiClient:
    """File-backed policy-signal client loading checked-in mock payload."""

    mock_file_path: Path

    def get_action_policy_signals(self, locode: str) -> dict[str, PolicySignalByAction]:
        """Load policy support signals grouped by action ID."""
        _ = locode  # Locode is unused because mock policy payload is city-agnostic.
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionsPolicySignalsApiResponse.model_validate(payload)
        return {
            signal_by_action.action_id: signal_by_action
            for signal_by_action in response.policy_signals
        }


class ApiLegalDataApiClient:
    """
    Placeholder legal client for future upstream HTTP integration.

    Current behavior fails fast until real HTTP integration is implemented.
    """

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[LegalRequirementRecord]]:
        """Raise until legal API integration is implemented."""
        del locode
        raise NotImplementedError(
            "ApiLegalDataApiClient is not implemented yet. "
            "Set HIAP_MEED_LEGAL_DATA_SOURCE=mock for local runs."
        )


class ApiPolicySignalsDataApiClient:
    """
    Placeholder policy-signals client for future upstream HTTP integration.

    Current behavior fails fast until real HTTP integration is implemented.
    """

    def get_action_policy_signals(self, locode: str) -> dict[str, PolicySignalByAction]:
        """Raise until policy signals API integration is implemented."""
        del locode
        raise NotImplementedError(
            "ApiPolicySignalsDataApiClient is not implemented yet. "
            "Set HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE=mock for local runs."
        )


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
_default_api_policy_signals_client = ApiPolicySignalsDataApiClient()
_default_mock_policy_signals_client = MockPolicySignalsDataApiClient(
    mock_file_path=Path(__file__).resolve().parents[2]
    / "data"
    / "mock"
    / "actions_policy_signals_api_mock.json"
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
    """FastAPI dependency provider for legal requirement client."""
    source = os.getenv("HIAP_MEED_LEGAL_DATA_SOURCE", "mock").strip().lower()
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


def get_policy_signals_data_api_client() -> (
    MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
):
    """FastAPI dependency provider for policy signals client."""
    source = os.getenv("HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE", "mock").strip().lower()
    if source == "api":
        return _default_api_policy_signals_client

    if not _default_mock_policy_signals_client.mock_file_path.exists():
        logger.warning(
            "Mock policy signals file not found at `%s`; using API policy signals client",
            _default_mock_policy_signals_client.mock_file_path,
        )
        return _default_api_policy_signals_client

    if source not in {"mock", "api"}:
        logger.warning(
            "Unknown HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE=`%s`; using mock policy signals client",
            source,
        )
    return _default_mock_policy_signals_client
