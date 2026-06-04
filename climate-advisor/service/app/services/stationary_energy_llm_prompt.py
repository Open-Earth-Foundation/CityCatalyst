from __future__ import annotations

import json
import logging
from typing import Any

from ..models.stationary_energy_drafts import LoadStationaryEnergyContextResponse
from ..utils.prompt_budget import (
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
    initial_count = count_prompt_tokens_for_input(
        system_prompt=system_prompt,
        llm_input=llm_input,
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
        "source_data_included": True,
        "max_normalized_rows_per_candidate": None,
    }
    if initial_count.tokens <= budget.max_prompt_tokens:
        return llm_input, trace

    compacted_input = compact_stationary_energy_prompt_payload(
        llm_input,
        budget=budget,
        drop_source_data=False,
    )
    compacted_count = count_prompt_tokens_for_input(
        system_prompt=system_prompt,
        llm_input=compacted_input,
        model=model,
        budget=budget,
    )
    compaction_stage = "normalized_rows"
    source_data_included = True
    if compacted_count.tokens > budget.max_prompt_tokens and not budget.include_source_data:
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
    allowed_capabilities: list[str],
) -> dict[str, Any]:
    """Build the bounded Stationary Energy prompt payload passed to the LLM."""
    return {
        "task": "generate_stationary_energy_draft_proposals",
        "rules": [
            "Use only this bounded context.",
            "Recommend only stored source candidates provided in source_candidates.",
            "Every recommendation must include candidate_id and datasource_id.",
            "recommended_datasource_id must exactly match the datasource_id for recommended_candidate_id.",
            "alternative_candidate_ids must be stored applicable candidate_id values.",
            "Return exactly one proposal per taxonomy row.",
            "Copy the full taxonomy row into target_ref for each proposal.",
            "Do not re-fetch or mutate source candidates.",
            "Do not invent values, source candidates, datasource IDs, city data, inventory data, or permissions.",
            "Use guidance_context for methodology explanations and terminology only; do not treat it as observed activity data.",
            "Do not commit inventory values; this is a draft proposal step.",
        ],
        "allowed_capabilities": allowed_capabilities,
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
