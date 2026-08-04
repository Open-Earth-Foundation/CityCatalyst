"""Synchronous client for the upstream action pathways API."""

from __future__ import annotations

import os
from dataclasses import dataclass

from pydantic import ValidationError

from app.modules.prioritizer.internal_models import Action, ActionPathwaysFetchResult
from app.modules.prioritizer.models import (
    ActionPathwayApiItem,
    ActionPathwaysApiResponse,
)
from app.services.http_client import UpstreamApiError, get_json_with_retries

DEFAULT_ACTION_PATHWAYS_BASE_URL = "https://ccglobal.openearth.dev"
ACTION_PATHWAYS_ENDPOINT = "GET /api/v1/action-pathways"


def get_action_pathways_base_url() -> str:
    """Return the configured shared Global API host."""
    raw_value = os.getenv("CCGLOBAL_API_BASE_URL")
    if raw_value is None or not raw_value.strip():
        return DEFAULT_ACTION_PATHWAYS_BASE_URL
    return raw_value.strip()


def map_action_pathway_api_item_to_action(action: ActionPathwayApiItem) -> Action:
    """Map one upstream action pathway row into the internal action model."""
    co_benefits = {
        impact_type: impact_entry.model_dump()
        for impact_type, impact_entry in action.co_benefits.items()
    }
    return Action(
        action_id=action.action_id,
        action_name=action.action_name,
        action_type=action.action_type,
        description=action.description,
        intervention_summary=action.intervention_summary,
        outcome_summary=action.outcome_summary,
        intervention_type=action.intervention_type,
        action_role=action.action_role,
        publisher_id=action.publisher_id,
        generation_method=action.generation_method,
        name_i18n=action.name_i18n,
        description_i18n=action.description_i18n,
        intervention_summary_i18n=action.intervention_summary_i18n,
        outcome_summary_i18n=action.outcome_summary_i18n,
        investment_cost=action.cost_investment_needed,
        implementation_timeline=action.timeline_for_implementation,
        emissions=action.emissions.model_dump() if action.emissions is not None else {},
        co_benefits=co_benefits,
        raw=action.model_dump(mode="json"),
    )


@dataclass
class ActionPathwaysApiService:
    """Fetch and map the upstream action pathways catalog."""

    base_url: str | None = None

    def __post_init__(self) -> None:
        """Resolve the upstream action pathways host from config when omitted."""
        if self.base_url is None:
            self.base_url = get_action_pathways_base_url()

    def _build_action_pathways_url(self) -> str:
        """Return the upstream URL requesting all available localized fields."""
        return f"{self.base_url.rstrip('/')}/api/v1/action-pathways?lang=all"

    def _base_source_metadata(
        self,
        *,
        url: str,
        http_status_code: int | None,
        upstream_generated_at_utc: str | None,
    ) -> dict[str, object]:
        """Return artifact-friendly source metadata for one request."""
        return {
            "mock_file_path": None,
            "upstream_url": url,
            "upstream_endpoint": ACTION_PATHWAYS_ENDPOINT,
            "http_status_code": http_status_code,
            "upstream_generated_at_utc": upstream_generated_at_utc,
        }

    def list_actions(self) -> ActionPathwaysFetchResult:
        """Fetch and map the full upstream action pathways catalog."""
        action_url = self._build_action_pathways_url()
        payload, http_status_code = get_json_with_retries(
            url=action_url,
            operation_name="action pathways API call",
            headers={"accept": "application/json"},
        )
        try:
            response = ActionPathwaysApiResponse.model_validate(payload)
        except ValidationError as error:
            raise UpstreamApiError(
                status_code=502,
                message="action pathways API returned a payload that failed schema validation",
                upstream_status_code=http_status_code,
                url=action_url,
            ) from error

        source_metadata = self._base_source_metadata(
            url=action_url,
            http_status_code=http_status_code,
            upstream_generated_at_utc=response.meta.generated_at_utc,
        )
        return ActionPathwaysFetchResult(
            actions=[
                map_action_pathway_api_item_to_action(action)
                for action in response.actions
            ],
            source_metadata=source_metadata,
            upstream_meta=response.meta.model_dump(mode="json"),
            warning=None,
        )
