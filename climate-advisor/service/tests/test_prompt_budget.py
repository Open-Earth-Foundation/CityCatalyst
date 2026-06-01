from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.config.settings import _load_llm_config
from app.utils.prompt_budget import (
    StationaryEnergyPromptBudget,
    compact_stationary_energy_prompt_payload,
    count_prompt_tokens,
    get_stationary_energy_prompt_budget,
    trim_messages_to_budget,
)


def test_stationary_energy_prompt_budget_loads_from_llm_config() -> None:
    settings = type("Settings", (), {"llm": _load_llm_config()})()

    draft_budget = get_stationary_energy_prompt_budget(
        settings,
        "draft_generation",
    )
    chat_budget = get_stationary_energy_prompt_budget(settings, "chat_context")

    assert draft_budget.tokenizer_encoding == "o200k_base"
    assert draft_budget.max_prompt_tokens == 150000
    assert chat_budget.max_prompt_tokens == 150000


def test_count_prompt_tokens_falls_back_for_openrouter_gpt_5_4_slug() -> None:
    token_count = count_prompt_tokens(
        ["Stationary Energy prompt"],
        model="openai/gpt-5.4",
        fallback_encoding="o200k_base",
    )

    assert token_count.tokens > 0
    assert token_count.tokenizer == "o200k_base"


def test_stationary_energy_compaction_caps_only_candidates_with_too_many_rows() -> None:
    payload = {
        "source_candidates": [
            {
                "candidate_id": "candidate-1",
                "datasource_id": "ds-1",
                "source_data": {"records": list(range(50))},
                "normalized_rows": [{"row": index} for index in range(10)],
                "applicability_status": "applicable",
            },
            {
                "candidate_id": "candidate-2",
                "datasource_id": "ds-2",
                "source_data": {"error": "not applicable"},
                "normalized_rows": [{"row": index} for index in range(2)],
                "applicability_status": "removed",
            },
        ],
    }

    compacted = compact_stationary_energy_prompt_payload(
        payload,
        budget=StationaryEnergyPromptBudget(
            max_normalized_rows_per_candidate=3,
            include_source_data=False,
        ),
    )

    applicable, removed = compacted["source_candidates"]
    assert applicable["source_data"] == {"records": list(range(50))}
    assert len(applicable["normalized_rows"]) == 3
    assert applicable["normalized_rows_count"] == 10
    assert applicable["normalized_rows_truncated"] is True
    assert removed["source_data"] == {"error": "not applicable"}
    assert len(removed["normalized_rows"]) == 2
    assert removed["normalized_rows_count"] == 2
    assert removed["normalized_rows_truncated"] is False


def test_stationary_energy_compaction_can_drop_source_data_as_second_stage() -> None:
    payload = {
        "source_candidates": [
            {
                "candidate_id": "candidate-1",
                "datasource_id": "ds-1",
                "source_data": {"records": list(range(50))},
                "normalized_rows": [{"row": index} for index in range(2)],
                "applicability_status": "applicable",
            },
        ],
    }

    compacted = compact_stationary_energy_prompt_payload(
        payload,
        budget=StationaryEnergyPromptBudget(
            max_normalized_rows_per_candidate=3,
            include_source_data=False,
        ),
        drop_source_data=True,
    )

    candidate = compacted["source_candidates"][0]
    assert "source_data" not in candidate
    assert candidate["source_data_omitted"] is True
    assert len(candidate["normalized_rows"]) == 2


def test_trim_messages_to_budget_preserves_stationary_context_and_current_user() -> None:
    stationary_context = {
        "role": "system",
        "content": "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\nsmall context",
    }
    messages = [
        stationary_context,
        {"role": "user", "content": "old " * 500},
        {"role": "assistant", "content": "old response " * 500},
        {"role": "user", "content": "current question"},
    ]

    trimmed, token_count, removed = trim_messages_to_budget(
        messages,
        instruction_text="system prompt",
        model="openai/gpt-5.4",
        budget=StationaryEnergyPromptBudget(max_prompt_tokens=80),
    )

    assert removed > 0
    assert trimmed[0] == stationary_context
    assert trimmed[-1]["content"] == "current question"
    assert token_count.tokens <= 80
