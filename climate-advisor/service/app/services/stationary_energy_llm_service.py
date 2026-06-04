from __future__ import annotations

import json
import logging
import os

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

from ..config import get_settings
from ..models.stationary_energy_drafts import LoadStationaryEnergyContextResponse
from ..utils.agent_tracing import configure_agents_tracing
from .openrouter_client import build_openrouter_client_options
from .stationary_energy_llm_models import (
    StationaryEnergyLLMProposal,
    StationaryEnergyLLMProposalResult,
    StationaryEnergyLLMResponse,
)
from .stationary_energy_llm_output import (
    generation_failure_message,
    json_safe,
    parsed_output_from_result,
    raw_output_from_result,
    usage_from_result,
    validate_and_normalize_proposals,
)
from .stationary_energy_llm_prompt import (
    build_llm_input,
    enforce_prompt_budget,
    trace_metadata,
)


logger = logging.getLogger(__name__)


class StationaryEnergyLLMServiceError(RuntimeError):
    """Raised when proposal generation cannot complete through the LLM boundary."""


class StationaryEnergyProposalLLMService:
    """Generate Stationary Energy draft proposals using a real LLM call."""

    def __init__(self, *, client: AsyncOpenAI | None = None) -> None:
        """Initialize the proposal service with shared prompt and OpenRouter config."""
        self.settings = get_settings()
        configure_agents_tracing(self.settings)
        self.model = (
            os.getenv("OPENROUTER_AGENTIC_FLOW_MODEL")
            or os.getenv("OPENROUTER_MODEL")
            or self.settings.llm.models.get("agentic_flow")
            or self.settings.openrouter_model
            or self.settings.llm.models.get("default", "openai/gpt-4.1")
        )
        self.temperature = self.settings.llm.generation.defaults.temperature
        self.system_prompt = self.settings.llm.prompts.get_prompt(
            "stationary_energy_draft_generation"
        )
        self.client = client or self._create_openrouter_client()

    def _create_openrouter_client(self) -> AsyncOpenAI:
        """Create an AsyncOpenAI client using the shared OpenRouter settings helper."""
        client_options = build_openrouter_client_options(
            self.settings,
            missing_api_key_message=(
                "OPENROUTER_API_KEY must be set for Stationary Energy LLM proposals"
            ),
            error_cls=StationaryEnergyLLMServiceError,
        )
        return AsyncOpenAI(**client_options.kwargs)

    @staticmethod
    def _validate_and_normalize_proposals(
        proposals: list[StationaryEnergyLLMProposal],
        stored_source_candidates: list[dict[str, object]],
        taxonomy_rows: list[object],
    ) -> list[dict[str, object]]:
        """Preserve the historic test seam for proposal validation helpers."""
        return validate_and_normalize_proposals(
            proposals,
            stored_source_candidates,
            taxonomy_rows,
        )

    async def generate_proposals(
        self,
        *,
        context: LoadStationaryEnergyContextResponse,
        stored_source_candidates: list[dict[str, object]],
        allowed_capabilities: list[str],
        trace_id: str | None,
    ) -> StationaryEnergyLLMProposalResult:
        """Generate one normalized proposal per taxonomy row for review-ready drafts."""
        llm_input = build_llm_input(
            context=context,
            stored_source_candidates=stored_source_candidates,
            allowed_capabilities=allowed_capabilities,
        )
        try:
            llm_input, prompt_budget_trace = enforce_prompt_budget(
                settings=self.settings,
                system_prompt=self.system_prompt,
                llm_input=llm_input,
                model=self.model,
            )
        except ValueError as exc:
            raise StationaryEnergyLLMServiceError(str(exc)) from exc

        logger.info(
            "Stationary Energy LLM proposal request trace_id=%s model=%s taxonomy=%s candidates=%s prompt_tokens=%s max_prompt_tokens=%s compacted=%s",
            trace_id,
            self.model,
            len(context.taxonomy),
            len(stored_source_candidates),
            prompt_budget_trace["tokens"],
            prompt_budget_trace["max_prompt_tokens"],
            prompt_budget_trace["compacted"],
        )
        if self.settings.llm.logging.log_requests:
            logger.debug(
                "Stationary Energy LLM input trace_id=%s payload=%s",
                trace_id,
                json.dumps(llm_input, ensure_ascii=True),
            )

        agents_trace_id = gen_trace_id()
        metadata = trace_metadata(
            context=context,
            stored_source_candidates=stored_source_candidates,
            trace_id=trace_id,
        )
        agent = Agent(
            name="Stationary Energy Draft Agent",
            instructions=self.system_prompt,
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
                    trace_metadata=metadata,
                    tracing_disabled=not self.settings.langsmith_tracing_enabled,
                ),
            )
        except Exception as exc:
            failure_message = generation_failure_message(exc)
            logger.warning(
                "Stationary Energy agent run failed trace_id=%s agents_trace_id=%s model=%s error_type=%s error=%s",
                trace_id,
                agents_trace_id,
                self.model,
                type(exc).__name__,
                exc,
            )
            raise StationaryEnergyLLMServiceError(failure_message) from exc

        raw_output = raw_output_from_result(result)
        if self.settings.llm.logging.log_responses:
            logger.debug(
                "Stationary Energy LLM output trace_id=%s payload=%s",
                trace_id,
                raw_output,
            )

        try:
            parsed = parsed_output_from_result(result, raw_output)
            proposals = validate_and_normalize_proposals(
                parsed.proposals,
                stored_source_candidates,
                context.taxonomy,
            )
            if not proposals and (context.taxonomy or stored_source_candidates):
                raise ValueError("Stationary Energy LLM returned no proposals")
        except ValueError as exc:
            raise StationaryEnergyLLMServiceError(str(exc)) from exc

        trace = json_safe(
            {
                "model": self.model,
                "temperature": self.temperature,
                "prompt_budget": prompt_budget_trace,
                "input": llm_input,
                "raw_output": raw_output,
                "parsed_output": {
                    "proposals": proposals,
                },
                "usage": usage_from_result(result),
                "agents_trace": {
                    "trace_id": agents_trace_id,
                    "group_id": trace_id,
                    "workflow_name": "Stationary Energy Draft Generation",
                    "langsmith_enabled": bool(self.settings.langsmith_tracing_enabled),
                    "metadata": metadata,
                },
            }
        )
        return StationaryEnergyLLMProposalResult(proposals=proposals, trace=trace)
