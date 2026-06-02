from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import asdict, dataclass, is_dataclass
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from agents import (
    Agent,
    AgentOutputSchema,
    ModelSettings,
    OpenAIChatCompletionsModel,
    RunConfig,
    Runner,
    gen_trace_id,
)
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings
from app.models.stationary_energy_drafts import LoadStationaryEnergyContextResponse
from app.utils.agent_tracing import configure_agents_tracing
from app.utils.stationary_energy_context import (
    stationary_energy_scope_identity,
    stationary_energy_scope_label,
    stationary_energy_scope_matches_target,
)


logger = logging.getLogger(__name__)


class StationaryEnergyLLMServiceError(RuntimeError):
    """Raised when proposal generation cannot complete through the LLM boundary."""


class StationaryEnergyLLMProposal(BaseModel):
    """Structured proposal item returned by the Stationary Energy LLM."""

    target_ref: dict[str, Any] = Field(default_factory=dict)
    current_value: dict[str, Any] | None = None
    recommended_candidate_id: UUID | None = None
    recommended_datasource_id: str | None = None
    alternative_candidate_ids: list[UUID] = Field(default_factory=list)
    proposed_value: dict[str, Any] | None = None
    rationale: str
    status: Literal["ready", "needs_review", "gap", "conflict"]
    confidence_score: Decimal | None = Field(default=None, ge=0, le=1)


class StationaryEnergyLLMResponse(BaseModel):
    """Structured LLM response containing draft proposals."""

    proposals: list[StationaryEnergyLLMProposal] = Field(default_factory=list)


@dataclass
class StationaryEnergyLLMProposalResult:
    """Validated proposal payload and trace metadata from the LLM call."""

    proposals: list[dict[str, Any]]
    trace: dict[str, Any]


class StationaryEnergyProposalLLMService:
    """Generate Stationary Energy draft proposals using a real LLM call."""

    def __init__(self, *, client: AsyncOpenAI | None = None) -> None:
        """Initialize model settings, prompt instructions, and OpenRouter client."""

        self.settings = get_settings()
        configure_agents_tracing(self.settings)
        self.model = (
            self.settings.llm.models.get("agentic_flow")
            or self.settings.llm.models["default"]
        )
        self.temperature = self.settings.llm.generation.defaults.temperature
        self.instructions = self.settings.llm.prompts.get_prompt(
            "stationary_energy_draft"
        )
        self.client = client or self._create_openrouter_client()

    def _create_openrouter_client(self) -> AsyncOpenAI:
        """Create the OpenRouter-compatible async OpenAI client."""

        api_key = self.settings.openrouter_api_key
        if not api_key:
            raise StationaryEnergyLLMServiceError(
                "OPENROUTER_API_KEY must be set for Stationary Energy LLM proposals"
            )

        base_url = self.settings.llm.api.openrouter.base_url
        timeout_ms = self.settings.llm.api.openrouter.timeout_ms or 30000
        referer = os.getenv("OPENROUTER_REFERER") or "https://citycatalyst.ai"
        title = os.getenv("OPENROUTER_TITLE") or "CityCatalyst Climate Advisor"

        return AsyncOpenAI(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            timeout=timeout_ms / 1000,
            max_retries=self.settings.llm.api.openrouter.retry_attempts or 2,
            default_headers={
                "HTTP-Referer": referer,
                "X-Title": title,
                "Accept": "application/json",
            },
        )

    async def generate_proposals(
        self,
        *,
        context: LoadStationaryEnergyContextResponse,
        stored_source_candidates: list[dict[str, Any]],
        allowed_capabilities: list[str],
        trace_id: str | None,
    ) -> StationaryEnergyLLMProposalResult:
        """Generate and validate Stationary Energy draft proposals."""

        llm_input = self._build_llm_input(
            context=context,
            stored_source_candidates=stored_source_candidates,
            allowed_capabilities=allowed_capabilities,
        )
        logger.info(
            "Stationary Energy LLM proposal request trace_id=%s model=%s taxonomy=%s candidates=%s",
            trace_id,
            self.model,
            len(context.taxonomy),
            len(stored_source_candidates),
        )
        if self.settings.llm.logging.log_requests:
            logger.debug(
                "Stationary Energy LLM input trace_id=%s payload=%s",
                trace_id,
                json.dumps(llm_input, ensure_ascii=True),
            )

        agents_trace_id = gen_trace_id()
        trace_metadata = self._trace_metadata(
            context=context,
            stored_source_candidates=stored_source_candidates,
            trace_id=trace_id,
        )
        agent = Agent(
            name="Stationary Energy Draft Agent",
            instructions=self.instructions,
            model=OpenAIChatCompletionsModel(
                model=self.model,
                openai_client=self.client,
            ),
            model_settings=ModelSettings(
                temperature=self.temperature,
                include_usage=True,
            ),
            output_type=AgentOutputSchema(
                StationaryEnergyLLMResponse,
                strict_json_schema=False,
            ),
        )

        try:
            result = await Runner.run(
                agent,
                json.dumps(llm_input, ensure_ascii=True),
                max_turns=1,
                run_config=RunConfig(
                    workflow_name="Stationary Energy Draft Generation",
                    trace_id=agents_trace_id,
                    group_id=trace_id,
                    trace_metadata=trace_metadata,
                    tracing_disabled=not self.settings.langsmith_tracing_enabled,
                ),
            )
        except Exception as exc:
            logger.warning(
                "Stationary Energy agent run failed trace_id=%s agents_trace_id=%s model=%s error_type=%s error=%s",
                trace_id,
                agents_trace_id,
                self.model,
                type(exc).__name__,
                exc,
            )
            raise StationaryEnergyLLMServiceError(
                "Stationary Energy agent run failed"
            ) from exc

        raw_output = self._raw_output_from_result(result)
        if self.settings.llm.logging.log_responses:
            logger.debug(
                "Stationary Energy LLM output trace_id=%s payload=%s",
                trace_id,
                raw_output,
            )

        try:
            parsed = self._parsed_output_from_result(result, raw_output)
            proposals = self._validate_and_normalize_proposals(
                parsed.proposals,
                stored_source_candidates,
                context.taxonomy,
            )
            if not proposals and (context.taxonomy or stored_source_candidates):
                raise ValueError("Stationary Energy LLM returned no proposals")
        except ValueError as exc:
            raise StationaryEnergyLLMServiceError(str(exc)) from exc

        trace = self._json_safe(
            {
                "model": self.model,
                "temperature": self.temperature,
                "input": llm_input,
                "raw_output": raw_output,
                "parsed_output": {
                    "proposals": proposals,
                },
                "usage": self._usage_from_result(result),
                "agents_trace": {
                    "trace_id": agents_trace_id,
                    "group_id": trace_id,
                    "workflow_name": "Stationary Energy Draft Generation",
                    "langsmith_enabled": bool(self.settings.langsmith_tracing_enabled),
                    "metadata": trace_metadata,
                },
            }
        )
        return StationaryEnergyLLMProposalResult(proposals=proposals, trace=trace)

    @staticmethod
    def _trace_metadata(
        *,
        context: LoadStationaryEnergyContextResponse,
        stored_source_candidates: list[dict[str, Any]],
        trace_id: str | None,
    ) -> dict[str, Any]:
        """Build trace metadata for Stationary Energy draft generation."""

        return {
            "service": "climate-advisor",
            "workflow": "stationary_energy_draft_generation",
            "trace_category": "ca_agentic_flow",
            "ca_agentic_flow": True,
            "feature_flag": "STATIONARY_ENERGY_AGENTIC",
            "context_mode": "stationary_energy_draft",
            "request_id": trace_id,
            "city_id": context.city.city_id,
            "inventory_id": context.inventory.inventory_id,
            "sector_code": "stationary_energy",
            "taxonomy_count": len(context.taxonomy),
            "source_candidate_count": len(stored_source_candidates),
        }

    @staticmethod
    def _build_llm_input(
        *,
        context: LoadStationaryEnergyContextResponse,
        stored_source_candidates: list[dict[str, Any]],
        allowed_capabilities: list[str],
    ) -> dict[str, Any]:
        """Build the bounded JSON input sent to the LLM."""

        return {
            "task": "generate_stationary_energy_draft_proposals",
            "rules": [
                "Use only this bounded context.",
                "Recommend only stored source candidates with applicability_status='applicable'.",
                "Every recommendation must include candidate_id and datasource_id.",
                "recommended_datasource_id must exactly match the datasource_id for recommended_candidate_id.",
                "alternative_candidate_ids must be stored applicable candidate_id values.",
                "Return exactly one proposal per taxonomy row.",
                "Copy the full taxonomy row into target_ref for each proposal.",
                "Do not re-fetch or mutate source candidates.",
                "Do not invent values, source candidates, datasource IDs, city data, inventory data, or permissions.",
                "Do not commit inventory values; this is a draft proposal step.",
            ],
            "allowed_capabilities": allowed_capabilities,
            "city": context.city.model_dump(mode="json", exclude_none=True),
            "inventory": context.inventory.model_dump(mode="json", exclude_none=True),
            "taxonomy": [
                row.model_dump(mode="json", exclude_none=True)
                for row in context.taxonomy
            ],
            "current_values": [
                row.model_dump(mode="json", exclude_none=True)
                for row in context.current_values
            ],
            "source_candidates": stored_source_candidates,
            "expected_output_shape": {
                "proposals": [
                    {
                        "target_ref": "object copied or narrowed from taxonomy row",
                        "current_value": "matching current value object or null",
                        "recommended_candidate_id": "stored candidate_id or null",
                        "recommended_datasource_id": "stored datasource_id or null",
                        "alternative_candidate_ids": ["stored candidate_id"],
                        "proposed_value": "object with draft value evidence or null",
                        "rationale": "short human-readable explanation",
                        "status": "ready | conflict | gap | needs_review",
                        "confidence_score": "number between 0 and 1 or null",
                    }
                ]
            },
        }

    def _parse_llm_output(self, raw_output: str) -> StationaryEnergyLLMResponse:
        """Parse raw LLM text into the structured response schema."""

        payload_text = self._extract_json_text(raw_output)
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Stationary Energy LLM returned invalid JSON: {exc}") from exc

        try:
            return StationaryEnergyLLMResponse.model_validate(payload)
        except ValidationError as exc:
            raise ValueError(f"Stationary Energy LLM output failed schema validation: {exc}") from exc

    @staticmethod
    def _extract_json_text(raw_output: str) -> str:
        """Extract a JSON object from raw or fenced LLM output."""

        raw_output = raw_output.strip()
        fenced = re.search(r"```(?:json)?\s*(.*?)```", raw_output, flags=re.DOTALL)
        if fenced:
            return fenced.group(1).strip()
        return raw_output

    def _parsed_output_from_result(
        self,
        result: Any,
        raw_output: str,
    ) -> StationaryEnergyLLMResponse:
        """Return structured output from an Agents SDK result."""

        try:
            final_output = result.final_output_as(
                StationaryEnergyLLMResponse,
                raise_if_incorrect_type=True,
            )
            return final_output
        except Exception:
            return self._parse_llm_output(raw_output)

    @staticmethod
    def _raw_output_from_result(result: Any) -> str:
        """Return a serializable raw-output string from an Agents SDK result."""

        final_output = getattr(result, "final_output", None)
        if hasattr(final_output, "model_dump_json"):
            return final_output.model_dump_json()
        if isinstance(final_output, str):
            return final_output
        return json.dumps(final_output, default=str, ensure_ascii=True)

    def _usage_from_result(self, result: Any) -> dict[str, Any] | None:
        """Aggregate usage metadata from raw model responses."""

        usage: dict[str, Any] = {}
        for response in getattr(result, "raw_responses", []) or []:
            response_usage = self._serializable_model(getattr(response, "usage", None))
            if not response_usage:
                continue
            for key, value in response_usage.items():
                if isinstance(value, (int, float)):
                    usage[key] = usage.get(key, 0) + value
                elif key not in usage:
                    usage[key] = value
        return usage or None

    @staticmethod
    def _validate_and_normalize_proposals(
        proposals: list[StationaryEnergyLLMProposal],
        stored_source_candidates: list[dict[str, Any]],
        taxonomy_rows: list[Any],
    ) -> list[dict[str, Any]]:
        """Validate LLM proposals against taxonomy and stored candidates."""

        taxonomy_by_identity = StationaryEnergyProposalLLMService._taxonomy_by_identity(taxonomy_rows)
        candidate_by_id = {
            str(candidate["candidate_id"]): candidate
            for candidate in stored_source_candidates
            if candidate.get("candidate_id")
        }
        applicable_candidate_ids = {
            candidate_id
            for candidate_id, candidate in candidate_by_id.items()
            if candidate.get("applicability_status") == "applicable"
        }
        normalized: list[dict[str, Any]] = []
        seen_taxonomy_rows: set[tuple[str | None, ...]] = set()
        for proposal in proposals:
            proposal_identity = stationary_energy_scope_identity(proposal.target_ref)
            if proposal_identity not in taxonomy_by_identity:
                raise ValueError(
                    "Stationary Energy LLM returned a target_ref outside the bounded taxonomy: "
                    f"{stationary_energy_scope_label(proposal.target_ref)}"
                )
            if proposal_identity in seen_taxonomy_rows:
                raise ValueError(
                    "Stationary Energy LLM returned multiple proposals for the same taxonomy row: "
                    f"{stationary_energy_scope_label(proposal.target_ref)}"
                )
            seen_taxonomy_rows.add(proposal_identity)
            canonical_target_ref = taxonomy_by_identity[proposal_identity]

            recommended_candidate_id = (
                str(proposal.recommended_candidate_id)
                if proposal.recommended_candidate_id
                else None
            )
            if recommended_candidate_id and recommended_candidate_id not in applicable_candidate_ids:
                raise ValueError(
                    "Stationary Energy LLM recommended a candidate outside the applicable stored snapshot"
                )

            recommended_candidate = (
                candidate_by_id.get(recommended_candidate_id)
                if recommended_candidate_id
                else None
            )
            if recommended_candidate:
                expected_datasource_id = recommended_candidate.get("datasource_id")
                if not proposal.recommended_datasource_id:
                    raise ValueError(
                        "Stationary Energy LLM omitted recommended_datasource_id for a recommended candidate"
                    )
                if proposal.recommended_datasource_id != expected_datasource_id:
                    raise ValueError(
                        "Stationary Energy LLM returned a datasource ID that does not match the recommended candidate"
                    )
                if not stationary_energy_scope_matches_target(
                    target_ref=canonical_target_ref,
                    source_scope=recommended_candidate.get("source_scope"),
                ):
                    raise ValueError(
                        "Stationary Energy LLM recommended a candidate outside the proposal target scope: "
                        f"{stationary_energy_scope_label(canonical_target_ref)}"
                    )
                recommended_datasource_id = expected_datasource_id
            else:
                if proposal.recommended_datasource_id:
                    raise ValueError(
                        "Stationary Energy LLM returned recommended_datasource_id without a candidate_id"
                    )
                recommended_datasource_id = None

            alternative_candidate_ids: list[str] = []
            seen_alternatives: set[str] = set()
            for candidate_id in proposal.alternative_candidate_ids:
                candidate_id_text = str(candidate_id)
                if candidate_id_text not in applicable_candidate_ids:
                    raise ValueError(
                        "Stationary Energy LLM returned an alternative candidate outside the applicable stored snapshot"
                    )
                alternative_candidate = candidate_by_id[candidate_id_text]
                if not stationary_energy_scope_matches_target(
                    target_ref=canonical_target_ref,
                    source_scope=alternative_candidate.get("source_scope"),
                ):
                    raise ValueError(
                        "Stationary Energy LLM returned an alternative candidate outside the proposal target scope: "
                        f"{stationary_energy_scope_label(canonical_target_ref)}"
                    )
                if candidate_id_text != recommended_candidate_id and candidate_id_text not in seen_alternatives:
                    alternative_candidate_ids.append(candidate_id_text)
                    seen_alternatives.add(candidate_id_text)

            normalized.append(
                {
                    "target_ref": canonical_target_ref,
                    "current_value": proposal.current_value,
                    "recommended_candidate_id": (
                        UUID(recommended_candidate_id)
                        if recommended_candidate_id
                        else None
                    ),
                    "recommended_datasource_id": recommended_datasource_id,
                    "alternative_candidate_ids": alternative_candidate_ids,
                    "proposed_value": proposal.proposed_value,
                    "rationale": proposal.rationale,
                    "status": proposal.status,
                    "confidence_score": proposal.confidence_score,
                }
            )

        missing_rows = [
            taxonomy_by_identity[identity]
            for identity in taxonomy_by_identity
            if identity not in seen_taxonomy_rows
        ]
        if missing_rows:
            missing_labels = ", ".join(
                stationary_energy_scope_label(row)
                for row in missing_rows
            )
            raise ValueError(
                "Stationary Energy LLM omitted taxonomy rows from the draft: "
                f"{missing_labels}"
            )

        return normalized

    @staticmethod
    def _taxonomy_by_identity(
        taxonomy_rows: list[Any],
    ) -> dict[tuple[str | None, ...], dict[str, Any]]:
        """Index taxonomy rows by scope identity."""

        taxonomy_by_identity: dict[tuple[str | None, ...], dict[str, Any]] = {}
        for row in taxonomy_rows:
            row_payload = (
                row.model_dump(mode="json", exclude_none=True)
                if hasattr(row, "model_dump")
                else dict(row)
            )
            identity = stationary_energy_scope_identity(row_payload)
            if identity in taxonomy_by_identity:
                raise ValueError(
                    "Stationary Energy taxonomy contains duplicate rows for identity "
                    f"{stationary_energy_scope_label(row_payload)}"
                )
            taxonomy_by_identity[identity] = row_payload
        return taxonomy_by_identity

    @staticmethod
    def _serializable_model(value: Any) -> dict[str, Any] | None:
        """Convert SDK model-like objects into serializable dictionaries."""

        if value is None:
            return None
        if hasattr(value, "model_dump"):
            return value.model_dump(mode="json")
        if is_dataclass(value) and not isinstance(value, type):
            return asdict(value)
        if isinstance(value, dict):
            return value
        return None

    @staticmethod
    def _json_safe(value: Any) -> Any:
        """Round-trip a value through JSON to coerce non-serializable objects."""

        return json.loads(json.dumps(value, default=str, ensure_ascii=True))
