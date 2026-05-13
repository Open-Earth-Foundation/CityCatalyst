"""Synchronous client for the upstream city attributes API."""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.prioritizer.internal_models import CityData
from app.modules.prioritizer.models import CityApiResponse
from app.services.http_client import get_json_with_retries

CITY_ATTRIBUTES_BASE_URL = "https://ccglobal.openearth.dev"
CITY_ATTRIBUTES_ENDPOINT_TEMPLATE = "GET /api/v0/city_attributes/{locode}"


@dataclass
class CityAttributesApiService:
    """Fetch and map city context from the upstream city attributes API."""

    base_url: str = CITY_ATTRIBUTES_BASE_URL

    def _build_city_url(self, locode: str) -> str:
        """Return the full upstream city attributes URL for one locode."""
        normalized_locode = locode.strip().upper()
        return f"{self.base_url.rstrip('/')}/api/v0/city_attributes/{normalized_locode}"

    def get_city(self, locode: str) -> CityData:
        """Fetch one city payload from the upstream API and map it to `CityData`."""
        city_url = self._build_city_url(locode)

        # Fetch and validate the upstream response in one small, synchronous path.
        payload, http_status_code = get_json_with_retries(
            url=city_url,
            operation_name="city attributes API call",
            headers={"accept": "application/json"},
        )
        city_response = CityApiResponse.model_validate(payload)
        city = city_response.city

        # Preserve the full upstream city payload and lightweight fetch metadata.
        city_raw = city.model_dump()
        return CityData.model_validate(
            {
                **city_raw,
                "raw": city_raw,
                "source": "city_attributes_api",
                "source_metadata": {
                    "upstream_url": city_url,
                    "upstream_endpoint": CITY_ATTRIBUTES_ENDPOINT_TEMPLATE,
                    "requested_locode": locode.strip().upper(),
                    "http_status_code": http_status_code,
                    "upstream_generated_at_utc": city_response.meta.generated_at_utc,
                },
            }
        )
