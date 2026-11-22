from __future__ import annotations

import pytest

from app.utils.prompt_budget import (
    StationaryEnergyPromptBudget,
    compact_stationary_energy_prompt_payload,
    count_prompt_tokens,
    trim_messages_to_budget,
)


def test_count_prompt_tokens_falls_back_for_openrouter_gpt_5_6_sol_slug() -> None:
    token_count = count_prompt_tokens(
        ["Stationary Energy prompt"],
        model="openai/gpt-5.6-sol",
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


@pytest.mark.parametrize(
    "context_content, instruction_text",
    [
        ("STATIONARY_ENERGY_DRAFT_CONTEXT_JSON\nsmall context", "system prompt"),
        (
            "<role>\nStationary Energy prompt\n</role>\n\n"
            "<context>\nSTATIONARY_ENERGY_DRAFT_CONTEXT_JSON\nsmall context\n</context>",
            "",
        ),
    ],
    ids=["separate-context", "embedded-context"],
)
def test_trim_messages_to_budget_preserves_stationary_context_and_current_user(
    context_content: str, instruction_text: str
) -> None:
    stationary_context = {"role": "system", "content": context_content}
    messages = [
        stationary_context,
        {"role": "user", "content": "old " * 500},
        {"role": "assistant", "content": "old response " * 500},
        {"role": "user", "content": "current question"},
    ]

    trimmed, token_count, removed = trim_messages_to_budget(
        messages,
        instruction_text=instruction_text,
        model="openai/gpt-5.6-sol",
        budget=StationaryEnergyPromptBudget(max_prompt_tokens=80),
    )

    assert removed > 0
    assert trimmed[0] == stationary_context
    assert trimmed[-1]["content"] == "current question"
    assert token_count.tokens <= 80
