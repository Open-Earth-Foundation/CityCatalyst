"""Synchronous client for the upstream city attributes API."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote, urlencode

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import CityData
from app.modules.prioritizer.models import CityApiResponse
from app.services.http_client import UpstreamApiError, get_json_with_retries

DEFAULT_CITY_ATTRIBUTES_BASE_URL = "https://ccglobal.openearth.dev"
CITY_ATTRIBUTES_ENDPOINT_TEMPLATE = "GET /api/v0/city_attributes/{locode}"


def get_city_attributes_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_CITY_ATTRIBUTES_BASE_URL
    return raw_value.strip()


@dataclass
class CityAttributesApiService:
    """Fetch and map city context from the upstream city attributes API."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream city attributes host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_city_attributes_base_url()

    def _build_city_url(self, locode: str, version_label: str | None = None) -> str:
        """Return the full upstream city attributes URL for one locode."""
        normalized_locode = locode.strip().upper()
        encoded_locode = quote(normalized_locode, safe="")
        city_url = (
            f"{self.base_url.rstrip('/')}/api/v0/city_attributes/{encoded_locode}"
        )
        if version_label is None or not version_label.strip():
            return city_url
        query = urlencode({"version_label": version_label.strip()})
        return f"{city_url}?{query}"

    def _base_source_metadata(
        self,
        *,
        locode: str,
        version_label: str | None,
        url: str,
        http_status_code: int | None,
        upstream_generated_at_utc: str | None,
        upstream_api_context: dict[str, object] | None,
        upstream_datasources: list[dict[str, object]],
    ) -> dict[str, object]:
        """Return artifact-friendly source metadata for one city request."""
        return {
            "mock_file_path": None,
            "upstream_url": url,
            "upstream_endpoint": CITY_ATTRIBUTES_ENDPOINT_TEMPLATE,
            "requested_locode": locode.strip().upper(),
            "requested_version_label": (
                version_label.strip() if version_label and version_label.strip() else None
            ),
            "http_status_code": http_status_code,
            "upstream_generated_at_utc": upstream_generated_at_utc,
            "upstream_api_context": upstream_api_context,
            "upstream_datasources": upstream_datasources,
        }

    def get_city(self, locode: str, version_label: str | None = None) -> CityData:
        """Fetch one city payload from the upstream API and map it to `CityData`."""
        city_url = self._build_city_url(locode, version_label)

        # Fetch and validate the upstream response in one small, synchronous path.
        payload, http_status_code = get_json_with_retries(
            url=city_url,
            operation_name="city attributes API call",
            headers={"accept": "application/json"},
        )
        try:
            city_response = CityApiResponse.model_validate(payload)
            city = city_response.city
            response_meta = city_response.meta.model_dump(mode="json")

            # Preserve the full upstream city payload and lightweight fetch metadata.
            city_raw = city.model_dump(mode="json")
            return CityData.model_validate(
                {
                    **city_raw,
                    "raw": city_raw,
                    "source": "city_attributes_api",
                    "source_metadata": self._base_source_metadata(
                        locode=locode,
                        version_label=version_label,
                        url=city_url,
                        http_status_code=http_status_code,
                        upstream_generated_at_utc=city_response.meta.generated_at_utc,
                        upstream_api_context=response_meta.get("api_context"),
                        upstream_datasources=response_meta.get("datasources", []),
                    ),
                }
            )
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message="city attributes API returned a payload that failed schema validation",
                upstream_status_code=http_status_code,
                url=city_url,
            ) from error
