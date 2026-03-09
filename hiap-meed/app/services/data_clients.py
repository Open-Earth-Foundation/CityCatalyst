"""Repository/data-client protocols for external inputs."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.modules.prioritizer.models import Action, CityData


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


@dataclass
class StubCityDataApiClient:
    """
    In-memory fallback city client for local development and tests.

    If no city is preloaded for a locode, a minimal placeholder city is returned.
    """

    cities_by_locode: dict[str, CityData] = field(default_factory=dict)

    def get_city(self, locode: str) -> CityData:
        city = self.cities_by_locode.get(locode)
        if city is not None:
            return city
        return CityData(
            comuna_name=locode,
            locode=locode,
            region_name="unknown",
            comuna_code="unknown",
            region_code="unknown",
            city_context=[],
        )


@dataclass
class StubActionDataApiClient:
    """In-memory fallback action client for local development and tests."""

    actions: list[Action] = field(default_factory=list)

    def list_actions(self) -> list[Action]:
        return list(self.actions)


_default_city_client = StubCityDataApiClient()
_default_action_client = StubActionDataApiClient()


def get_city_data_api_client() -> CityDataApiClient:
    """FastAPI dependency provider for city data client."""
    return _default_city_client


def get_action_data_api_client() -> ActionDataApiClient:
    """FastAPI dependency provider for action data client."""
    return _default_action_client


__all__ = [
    "ActionDataApiClient",
    "CityDataApiClient",
    "StubActionDataApiClient",
    "StubCityDataApiClient",
    "get_action_data_api_client",
    "get_city_data_api_client",
]
