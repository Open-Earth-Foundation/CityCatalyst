from __future__ import annotations

import json
import logging
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal, Sequence

import tiktoken

logger = logging.getLogger(__name__)

StationaryEnergyBudgetFlow = Literal["chat_context"]


@dataclass(frozen=True)
class TokenCount:
    tokens: int
    tokenizer: str


@dataclass(frozen=True)
class StationaryEnergyPromptBudget:
    tokenizer_encoding: str = "o200k_base"
    max_prompt_tokens: int = 150000
    max_normalized_rows_per_candidate: int = 5
    include_source_data: bool = False


def get_stationary_energy_prompt_budget(
    settings: Any,
    flow: StationaryEnergyBudgetFlow,
) -> StationaryEnergyPromptBudget:
    """Read the Stationary Energy prompt budget config for a specific workflow."""
    # Walk the nested settings object defensively so tests can pass lightweight stubs.
    generation = getattr(getattr(settings, "llm", None), "generation", None)
    prompt_budget = getattr(generation, "prompt_budget", None)
    stationary_energy_budget = getattr(prompt_budget, "stationary_energy", None)
    flow_budget = getattr(stationary_energy_budget, flow, None)

    # Apply runtime defaults while preserving explicit zero row limits.
    return StationaryEnergyPromptBudget(
        tokenizer_encoding=getattr(prompt_budget, "tokenizer_encoding", None)
        or "o200k_base",
        max_prompt_tokens=int(
            getattr(flow_budget, "max_prompt_tokens", None) or 150000,
        ),
        max_normalized_rows_per_candidate=max(
            0,
            int(
                getattr(flow_budget, "max_normalized_rows_per_candidate", None)
                or 3,
            ),
        ),
        include_source_data=bool(
            getattr(flow_budget, "include_source_data", None) or False,
        ),
    )


def count_prompt_tokens(
    parts: Sequence[Any],
    *,
    model: str | None,
    fallback_encoding: str,
) -> TokenCount:
    """Count prompt tokens for a sequence of serializable prompt parts."""
    encoder = _tokenizer_for_model(model, fallback_encoding)
    text = "\n".join(_prompt_part_to_text(part) for part in parts if part is not None)
    return TokenCount(tokens=len(encoder.encode(text)), tokenizer=encoder.name)


def compact_stationary_energy_prompt_payload(
    payload: dict[str, Any],
    *,
    budget: StationaryEnergyPromptBudget,
    drop_source_data: bool = False,
) -> dict[str, Any]:
    """Trim source-candidate payload detail to fit a configured prompt budget."""
    compacted = deepcopy(payload)
    candidates = compacted.get("source_candidates")
    if isinstance(candidates, list):
        compacted["source_candidates"] = [
            compact_stationary_energy_source_candidate(
                candidate,
                budget=budget,
                drop_source_data=drop_source_data,
            )
            for candidate in candidates
        ]

    compacted["prompt_budget_compaction"] = {
        "source_data_included": not drop_source_data,
        "max_normalized_rows_per_candidate": budget.max_normalized_rows_per_candidate,
    }
    return compacted


def compact_stationary_energy_source_candidate(
    candidate: Any,
    *,
    budget: StationaryEnergyPromptBudget,
    drop_source_data: bool = False,
) -> Any:
    """Trim a single source-candidate payload according to prompt-budget limits."""
    if not isinstance(candidate, dict):
        return candidate

    compacted = deepcopy(candidate)
    if drop_source_data and "source_data" in compacted:
        compacted.pop("source_data", None)
        compacted["source_data_omitted"] = True

    rows = compacted.get("normalized_rows")
    if not isinstance(rows, list):
        return compacted

    row_count = len(rows)
    row_limit = budget.max_normalized_rows_per_candidate

    compacted["normalized_rows_count"] = row_count
    if row_count > row_limit:
        compacted["normalized_rows"] = rows[:row_limit]
        compacted["normalized_rows_truncated"] = True
        compacted["normalized_rows_sample_size"] = row_limit
    else:
        compacted["normalized_rows_truncated"] = False

    return compacted


def trim_messages_to_budget(
    messages: list[dict[str, Any]],
    *,
    instruction_text: str | None,
    model: str | None,
    budget: StationaryEnergyPromptBudget,
) -> tuple[list[dict[str, Any]], TokenCount, int]:
    """Drop oldest non-stationary chat messages until the prompt fits the budget."""
    trimmed = list(messages)
    token_count = count_prompt_tokens(
        [instruction_text, trimmed],
        model=model,
        fallback_encoding=budget.tokenizer_encoding,
    )
    removed = 0

    while token_count.tokens > budget.max_prompt_tokens and len(trimmed) > 2:
        remove_index = _oldest_non_stationary_context_index(trimmed)
        if remove_index is None:
            break
        trimmed.pop(remove_index)
        removed += 1
        token_count = count_prompt_tokens(
            [instruction_text, trimmed],
            model=model,
            fallback_encoding=budget.tokenizer_encoding,
        )

    return trimmed, token_count, removed


def _oldest_non_stationary_context_index(messages: list[dict[str, Any]]) -> int | None:
    """Find the oldest removable message that is not draft-context metadata."""
    for index, message in enumerate(messages[:-1]):
        if _is_stationary_energy_context_message(message):
            continue
        return index
    return None


def _is_stationary_energy_context_message(message: dict[str, Any]) -> bool:
    """Return whether a system message contains Stationary Energy draft context."""
    if message.get("role") != "system":
        return False
    content = str(message.get("content") or "")
    markers = (
        "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON",
        "STATIONARY_ENERGY_DRAFT_CONTEXT_UNAVAILABLE",
    )
    if content.startswith(markers):
        return True
    return "<context>" in content and any(marker in content for marker in markers)


def _tokenizer_for_model(model: str | None, fallback_encoding: str):
    """Resolve the best available tokenizer for a model name with fallback."""
    candidates = []
    if model:
        candidates.append(model)
        if "/" in model:
            candidates.append(model.rsplit("/", 1)[-1])

    for candidate in candidates:
        try:
            return tiktoken.encoding_for_model(candidate)
        except KeyError:
            continue

    try:
        return tiktoken.get_encoding(fallback_encoding)
    except ValueError:
        logger.warning(
            "Unknown tiktoken encoding %s; falling back to o200k_base",
            fallback_encoding,
        )
        return tiktoken.get_encoding("o200k_base")


def _prompt_part_to_text(part: Any) -> str:
    """Serialize one prompt part into text for token counting."""
    if isinstance(part, str):
        return part
    return json.dumps(part, ensure_ascii=True, default=str)
