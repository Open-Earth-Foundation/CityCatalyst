"""Synchronous client for upstream action financial feasibility scores."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import quote, urlencode

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import (
    ActionFinancialFeasibilityScoreRecord,
    ActionFinancialFeasibilityScoresFetchResult,
)
from app.modules.prioritizer.models import (
    ActionFinancialFeasibilityScoresApiResponse,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries

logger = logging.getLogger(__name__)

DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL = (
    "https://ccglobal.openearth.dev"
)
ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE = (
    "GET /api/v1/cities/{locode}/climate-finance/feasibility"
)


def get_action_financial_feasibility_scores_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_ACTION_FINANCIAL_FEASIBILITY_SCORES_BASE_URL
    return raw_value.strip()


@dataclass
class ActionFinancialFeasibilityScoresApiService:
    """Fetch and map city-scoped financial feasibility scores."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream financial feasibility host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_action_financial_feasibility_scores_base_url()

    def _build_action_financial_feasibility_scores_url(
        self, locode: str, country_code: str
    ) -> str:
        """Return the full upstream financial feasibility scores URL for one city."""
        normalized_locode = locode.strip().upper()
        normalized_country_code = country_code.strip().upper()
        encoded_locode = quote(normalized_locode, safe="")
        query = urlencode({"country_code": normalized_country_code})
        return (
            f"{self.base_url.rstrip('/')}/api/v1/cities/{encoded_locode}/"
            f"climate-finance/feasibility?{query}"
        )

    def _base_source_metadata(
        self,
        *,
        locode: str,
        country_code: str,
        url: str,
        http_status_code: int | None,
        upstream_generated_at_utc: str | None,
    ) -> dict[str, object]:
        """Return artifact-friendly source metadata for one request."""
        return {
            "mock_file_path": None,
            "upstream_url": url,
            "upstream_endpoint": ACTION_FINANCIAL_FEASIBILITY_SCORES_ENDPOINT_TEMPLATE,
            "requested_locode": locode.strip().upper(),
            "requested_country_code": country_code.strip().upper(),
            "http_status_code": http_status_code,
            "upstream_generated_at_utc": upstream_generated_at_utc,
        }

    def get_scores_by_action_id(
        self, locode: str, country_code: str
    ) -> ActionFinancialFeasibilityScoresFetchResult:
        """Fetch one city-scoped payload and map it by action ID."""
        scores_url = self._build_action_financial_feasibility_scores_url(
            locode,
            country_code,
        )
        try:
            payload, http_status_code = get_json_with_retries(
                url=scores_url,
                operation_name="action financial feasibility scores API call",
                headers={"accept": "application/json"},
            )
        except UpstreamApiError as error:
            if error.status_code != 404:
                raise
            warning = (
                "action financial feasibility scores API returned 404; continuing "
                f"with empty scores for locode={locode.strip().upper()}"
            )
            logger.warning(warning)
            return ActionFinancialFeasibilityScoresFetchResult(
                scores_by_action_id={},
                source_metadata=self._base_source_metadata(
                    locode=locode,
                    country_code=country_code,
                    url=scores_url,
                    http_status_code=error.upstream_status_code,
                    upstream_generated_at_utc=None,
                ),
                upstream_meta={},
                warning=warning,
            )

        try:
            response = ActionFinancialFeasibilityScoresApiResponse.model_validate(
                payload
            )
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message=(
                    "action financial feasibility scores API returned a payload "
                    "that failed schema validation"
                ),
                upstream_status_code=http_status_code,
                url=scores_url,
            ) from error

        source_metadata = self._base_source_metadata(
            locode=locode,
            country_code=country_code,
            url=scores_url,
            http_status_code=http_status_code,
            upstream_generated_at_utc=response.meta.generated_at_utc,
        )
        scores_by_action_id: dict[str, ActionFinancialFeasibilityScoreRecord] = {}
        for score in response.data:
            action_id = score.action_id
            if action_id in scores_by_action_id:
                raise UpstreamApiError(
                    status_code=502,
                    message=(
                        "action financial feasibility scores API returned duplicate "
                        f"action_id values for locode={locode.strip().upper()}"
                    ),
                    upstream_status_code=http_status_code,
                    url=scores_url,
                )
            score_raw = score.model_dump(mode="json")
            scores_by_action_id[action_id] = (
                ActionFinancialFeasibilityScoreRecord.model_validate(
                    {
                        "action_id": action_id,
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
            )

        return ActionFinancialFeasibilityScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
            warning=None,
        )
