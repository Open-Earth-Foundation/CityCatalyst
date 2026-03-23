"""Repository/data-client protocols for external inputs."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from app.modules.prioritizer.internal_models import (
    Action,
    CityData,
    HardFilterLegalRequirement,
)
from app.modules.prioritizer.models import (
    CityApiResponse,
    ActionsApiResponse,
    ActionsLegalApiResponse,
    CitiesApiResponse,
)

logger = logging.getLogger(__name__)


class CityDataApiClient:
    """Minimal interface for city data retrieval."""

    def get_city(self, locode: str) -> CityData:
        """Fetch city data for a location code."""
        raise NotImplementedError


class ActionDataApiClient:
    """Minimal interface for action catalog retrieval."""

    def list_actions(self) -> list[Action]:
        """Fetch action catalog records."""
        raise NotImplementedError


class LegalDataApiClient:
    """Minimal interface for legal requirement retrieval."""

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[HardFilterLegalRequirement]]:
        """Fetch legal requirements grouped by action ID for one city."""
        raise NotImplementedError


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
                    "comuna_name": city.comuna_name,
                    "locode": city.locode,
                    "country_code": city.countryCode,
                    "region_name": city.region_name,
                    "comuna_code": city.comuna_code,
                    "region_code": city.region_code,
                    "population_size": city.populationSize,
                    "population_density": city.populationDensity,
                    "area": city.area,
                    "raw": city_raw,
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
            mitigation_impact = {
                impact_type: impact_entry.model_dump()
                for impact_type, impact_entry in action.mitigationImpact.items()
            }
            actions.append(
                Action(
                    action_id=action.actionId,
                    action_name=action.actionName,
                    description=action.description,
                    action_category=action.actionCategory,
                    action_subcategory=action.actionSubcategory,
                    investment_cost=action.costInvestmentNeeded,
                    implementation_timeline=action.timelineForImplementation,
                    mitigation_impact=mitigation_impact,
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
    ) -> dict[str, list[HardFilterLegalRequirement]]:
        """Load mock legal requirements grouped by action ID."""
        _ = locode  # Locode is unused because mock legal payload is city-agnostic.
        payload = json.loads(self.mock_file_path.read_text(encoding="utf-8"))
        response = ActionsLegalApiResponse.model_validate(payload)
        requirements_by_action_id: dict[str, list[HardFilterLegalRequirement]] = {}
        for action_group in response.legal_requirements:
            requirements_by_action_id[action_group.action_id] = [
                HardFilterLegalRequirement(
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


class ApiLegalDataApiClient:
    """
    Placeholder legal client for future upstream HTTP integration.

    Current behavior returns an empty map to avoid blocking the pipeline.
    """

    def get_action_legal_requirements(
        self, locode: str
    ) -> dict[str, list[HardFilterLegalRequirement]]:
        """Return no legal requirements until HTTP integration is implemented."""
        _ = locode  # Locode is unused until the real upstream API call is wired.
        return {}


class ApiActionDataApiClient:
    """
    Placeholder action client for future upstream HTTP integration.

    Current behavior returns an empty list to avoid blocking the pipeline.
    """

    def list_actions(self) -> list[Action]:
        """Return no actions until HTTP integration is implemented."""
        return []


class ApiCityDataApiClient:
    """
    Placeholder city client for future upstream HTTP integration.

    Current behavior returns a minimal placeholder city until HTTP wiring exists.
    """

    def get_city(self, locode: str) -> CityData:
        """Return minimal city data until HTTP integration is implemented."""
        return CityData(
            comuna_name=locode,
            locode=locode,
            region_name="unknown",
            comuna_code="unknown",
            region_code="unknown",
            city_context=[],
        )


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


def get_city_data_api_client() -> CityDataApiClient:
    """FastAPI dependency provider for city data client."""
    source = os.getenv("HIAP_MEED_CITY_DATA_SOURCE", "mock").strip().lower()
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


def get_action_data_api_client() -> ActionDataApiClient:
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


def get_legal_data_api_client() -> LegalDataApiClient:
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
