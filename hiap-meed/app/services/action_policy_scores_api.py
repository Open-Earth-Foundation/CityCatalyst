"""Synchronous client for the upstream action policy scores API."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from urllib.parse import quote

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import (
    ActionPolicyScoreRecord,
    ActionPolicyScoresFetchResult,
)
from app.modules.prioritizer.models import ActionPolicyScoresApiResponse
from app.services.http_client import UpstreamApiError, get_json_with_retries

logger = logging.getLogger(__name__)

DEFAULT_ACTION_POLICY_SCORES_BASE_URL = "https://ccglobal.openearth.dev"
ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE = (
    "GET /api/v1/cities/{locode}/action-policy-scores"
)


def get_action_policy_scores_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_ACTION_POLICY_SCORES_BASE_URL
    return raw_value.strip()


@dataclass
class ActionPolicyScoresApiService:
    """Fetch and map city-scoped action policy scores from the upstream API."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream action policy scores host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_action_policy_scores_base_url()

    def _build_action_policy_scores_url(self, locode: str) -> str:
        """Return the full upstream action policy scores URL for one locode."""
        normalized_locode = locode.strip().upper()
        encoded_locode = quote(normalized_locode, safe="")
        return (
            f"{self.base_url.rstrip('/')}/api/v1/cities/"
            f"{encoded_locode}/action-policy-scores"
        )

    def _base_source_metadata(
        self,
        *,
        locode: str,
        url: str,
        http_status_code: int | None,
        upstream_generated_at_utc: str | None,
    ) -> dict[str, object]:
        """Return artifact-friendly source metadata for one request."""
        return {
            "mock_file_path": None,
            "upstream_url": url,
            "upstream_endpoint": ACTION_POLICY_SCORES_ENDPOINT_TEMPLATE,
            "requested_locode": locode.strip().upper(),
            "http_status_code": http_status_code,
            "upstream_generated_at_utc": upstream_generated_at_utc,
        }

    def get_scores_by_action_id(
        self, locode: str
    ) -> ActionPolicyScoresFetchResult:
        """Fetch one city-scoped policy payload and map it by action ID."""
        policy_url = self._build_action_policy_scores_url(locode)

        # Fetch the upstream policy scores; a 404 means the city has no score release.
        try:
            payload, http_status_code = get_json_with_retries(
                url=policy_url,
                operation_name="action policy scores API call",
                headers={"accept": "application/json"},
            )
        except UpstreamApiError as error:
            if error.status_code != 404:
                raise
            warning = (
                "action policy scores API returned 404; continuing with empty "
                f"policy scores for locode={locode.strip().upper()}"
            )
            logger.warning(warning)
            return ActionPolicyScoresFetchResult(
                scores_by_action_id={},
                source_metadata=self._base_source_metadata(
                    locode=locode,
                    url=policy_url,
                    http_status_code=error.upstream_status_code,
                    upstream_generated_at_utc=None,
                ),
                upstream_meta={},
                warning=warning,
            )

        try:
            policy_response = ActionPolicyScoresApiResponse.model_validate(payload)
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message=(
                    "action policy scores API returned a payload that failed "
                    "schema validation"
                ),
                upstream_status_code=http_status_code,
                url=policy_url,
            ) from error

        response_meta = policy_response.meta.model_dump(mode="json")
        source_metadata = self._base_source_metadata(
            locode=locode,
            url=policy_url,
            http_status_code=http_status_code,
            upstream_generated_at_utc=policy_response.meta.generated_at_utc,
        )

        scores_by_action_id: dict[str, ActionPolicyScoreRecord] = {}

        # Map rows by action ID and fail fast on duplicate upstream IDs.
        for score in policy_response.scores:
            action_id = score.src_action_id
            if action_id in scores_by_action_id:
                raise UpstreamApiError(
                    status_code=502,
                    message=(
                        "action policy scores API returned duplicate src_action_id "
                        f"values for locode={locode.strip().upper()}"
                    ),
                    upstream_status_code=http_status_code,
                    url=policy_url,
                )
            score_raw = score.model_dump(mode="json")
            scores_by_action_id[action_id] = ActionPolicyScoreRecord.model_validate(
                {
                    "action_id": action_id,
                    "policy_support_score": score.policy_support_score,
                    "policy_support_category": score.policy_support_category,
                    "best_relevance": score.best_relevance,
                    "n_findings": score.n_findings,
                    "n_docs": score.n_docs,
                    "sum_strength": score.sum_strength,
                    "policy_evidence": [
                        evidence.model_dump(mode="json")
                        for evidence in score.policy_evidence
                    ],
                    "raw": score_raw,
                    "source_metadata": source_metadata,
                }
            )
        return ActionPolicyScoresFetchResult(
            scores_by_action_id=scores_by_action_id,
            source_metadata=source_metadata,
            upstream_meta=response_meta,
            warning=None,
        )
