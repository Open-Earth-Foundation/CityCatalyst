from __future__ import annotations

from unittest.mock import patch

from app.models.stationary_energy_drafts import LoadStationaryEnergyContextResponse
from app.services.stationary_energy.stationary_energy_llm_prompt import (
    build_llm_input,
    enforce_prompt_budget,
)
from app.utils.prompt_budget import StationaryEnergyPromptBudget


def test_enforce_prompt_budget_pretrims_source_data_when_disabled() -> None:
    llm_input = {
        "source_candidates": [
            {
                "candidate_id": "candidate-1",
                "datasource_id": "ds-1",
                "source_data": {"raw": "should not reach the llm"},
                "normalized_rows": [{"row": 1}],
            }
        ]
    }

    with patch(
        "app.services.stationary_energy.stationary_energy_llm_prompt.get_stationary_energy_prompt_budget",
        return_value=StationaryEnergyPromptBudget(
            max_prompt_tokens=10_000,
            include_source_data=False,
        ),
    ):
        compacted_input, trace = enforce_prompt_budget(
            settings=object(),
            system_prompt="Stationary Energy system prompt",
            llm_input=llm_input,
            model="openai/gpt-5.4",
        )

    assert llm_input["source_candidates"][0]["source_data"] == {
        "raw": "should not reach the llm"
    }
    assert "source_data" not in compacted_input["source_candidates"][0]
    assert trace["source_data_included"] is False
    assert trace["compacted"] is False


def test_build_llm_input_uses_only_runtime_context_payload() -> None:
    context = LoadStationaryEnergyContextResponse.model_validate(
        {
            "city": {"city_id": "city-1", "name": "Testopolis"},
            "inventory": {"inventory_id": "inventory-1", "year": 2024},
            "taxonomy": [{"subsector_id": "I.1", "scope_id": "1"}],
            "current_values": [{"inventory_value_id": "value-1", "value": "42"}],
            "source_candidates": [],
            "guidance_context": {"sector_overview": "Stationary Energy draft guidance."},
        }
    )

    llm_input = build_llm_input(
        context=context,
        stored_source_candidates=[{"candidate_id": "candidate-1", "datasource_id": "ds-1"}],
    )

    assert set(llm_input) == {
        "city",
        "inventory",
        "taxonomy",
        "current_values",
        "source_candidates",
        "guidance_context",
    }
