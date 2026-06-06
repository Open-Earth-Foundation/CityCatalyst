from __future__ import annotations

import json
import logging
from copy import deepcopy
from typing import Any

from app.models.stationary_energy_drafts import LoadStationaryEnergyContextResponse
from app.utils.prompt_budget import (
    StationaryEnergyPromptBudget,
    compact_stationary_energy_prompt_payload,
    count_prompt_tokens,
    get_stationary_energy_prompt_budget,
)


logger = logging.getLogger(__name__)


def count_prompt_tokens_for_input(
    *,
    system_prompt: str,
    llm_input: dict[str, Any],
    model: str,
    budget: StationaryEnergyPromptBudget,
):
    """Count prompt tokens for the Stationary Energy system prompt and input payload."""
    return count_prompt_tokens(
        [system_prompt, json.dumps(llm_input, ensure_ascii=True)],
        model=model,
        fallback_encoding=budget.tokenizer_encoding,
    )


def enforce_prompt_budget(
    *,
    settings: Any,
    system_prompt: str,
    llm_input: dict[str, Any],
    model: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compact a Stationary Energy prompt payload until it fits the configured budget."""
    budget = get_stationary_energy_prompt_budget(
        settings,
        "draft_generation",
    )
    prepared_input = llm_input
    if not budget.include_source_data:
        prepared_input = deepcopy(llm_input)
        candidates = prepared_input.get("source_candidates")
        if isinstance(candidates, list):
            for candidate in candidates:
                if isinstance(candidate, dict):
                    candidate.pop("source_data", None)

    initial_count = count_prompt_tokens_for_input(
        system_prompt=system_prompt,
        llm_input=prepared_input,
        model=model,
        budget=budget,
    )
    trace = {
        "flow": "stationary_energy.draft_generation",
        "tokens": initial_count.tokens,
        "initial_tokens": initial_count.tokens,
        "max_prompt_tokens": budget.max_prompt_tokens,
        "tokenizer": initial_count.tokenizer,
        "compacted": False,
        "source_data_included": budget.include_source_data,
        "max_normalized_rows_per_candidate": None,
    }
    if initial_count.tokens <= budget.max_prompt_tokens:
        return prepared_input, trace

    compacted_input = compact_stationary_energy_prompt_payload(
        prepared_input,
        budget=budget,
        drop_source_data=not budget.include_source_data,
    )
    compacted_count = count_prompt_tokens_for_input(
        system_prompt=system_prompt,
        llm_input=compacted_input,
        model=model,
        budget=budget,
    )
    compaction_stage = "normalized_rows"
    source_data_included = budget.include_source_data
    if compacted_count.tokens > budget.max_prompt_tokens and budget.include_source_data:
        compacted_input = compact_stationary_energy_prompt_payload(
            compacted_input,
            budget=budget,
            drop_source_data=True,
        )
        compacted_count = count_prompt_tokens_for_input(
            system_prompt=system_prompt,
            llm_input=compacted_input,
            model=model,
            budget=budget,
        )
        compaction_stage = "source_data"
        source_data_included = False

    trace.update(
        {
            "tokens": compacted_count.tokens,
            "compacted_tokens": compacted_count.tokens,
            "tokenizer": compacted_count.tokenizer,
            "compacted": True,
            "compaction_stage": compaction_stage,
            "source_data_included": source_data_included,
            "max_normalized_rows_per_candidate": (
                budget.max_normalized_rows_per_candidate
            ),
        },
    )

    if compacted_count.tokens > budget.max_prompt_tokens:
        raise ValueError(
            "Stationary Energy prompt exceeds configured token budget after compaction "
            f"({compacted_count.tokens} > {budget.max_prompt_tokens})",
        )

    logger.info(
        "Compacted Stationary Energy draft prompt from %s to %s tokens using tokenizer=%s",
        initial_count.tokens,
        compacted_count.tokens,
        compacted_count.tokenizer,
    )
    return compacted_input, trace


def trace_metadata(
    *,
    context: LoadStationaryEnergyContextResponse,
    stored_source_candidates: list[dict[str, Any]],
    trace_id: str | None,
) -> dict[str, Any]:
    """Build tracing metadata for the Stationary Energy draft generation run."""
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
        "guidance_context_keys": sorted(context.guidance_context.keys()),
    }


def build_llm_input(
    *,
    context: LoadStationaryEnergyContextResponse,
    stored_source_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the bounded Stationary Energy prompt payload passed to the LLM."""
    return {
        "city": context.city.model_dump(mode="json", exclude_none=True),
        "inventory": context.inventory.model_dump(mode="json", exclude_none=True),
        "taxonomy": [
            row.model_dump(mode="json", exclude_none=True) for row in context.taxonomy
        ],
        "current_values": [
            row.model_dump(mode="json", exclude_none=True)
            for row in context.current_values
        ],
        "source_candidates": stored_source_candidates,
        "guidance_context": context.guidance_context,
    }
