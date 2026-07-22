from __future__ import annotations

from pathlib import Path

from app.config.settings import _load_llm_config
from app.config.settings import PromptsConfig

CA_ROOT = Path(__file__).resolve().parents[2]


def test_prompt_include_directive_resolves_relative_tools_fragment(tmp_path) -> None:
    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    (tools_dir / "default_tool_policy.md").write_text(
        "Available tools:\n\n- `example_tool`: use for example requests.",
        encoding="utf-8",
    )
    prompt_path = tmp_path / "chat.md"
    prompt_path.write_text(
        "<tools>\n{{ include: tools/default_tool_policy.md }}\n</tools>",
        encoding="utf-8",
    )

    prompts = PromptsConfig(
        core=str(prompt_path),
        chat=str(prompt_path),
        stationary_energy_review=str(prompt_path),
        cnb_funding_opportunity_research=str(prompt_path),
        cnb_similar_project_matching=str(prompt_path),
    )

    rendered_prompt = prompts.get_prompt("chat")

    assert "{{ include:" not in rendered_prompt
    assert "`example_tool`" in rendered_prompt


def test_configured_prompt_files_use_required_schema_blocks() -> None:
    """Ensure llm_config prompt entries stay aligned with AGENTS.md."""
    prompts = _load_llm_config().prompts
    prompt_entries = {
        "core": prompts.core,
        "chat": prompts.chat,
        "stationary_energy_review": prompts.stationary_energy_review,
        "cnb_funding_opportunity_research": (prompts.cnb_funding_opportunity_research),
        "cnb_similar_project_matching": prompts.cnb_similar_project_matching,
    }

    for prompt_name, prompt_path in prompt_entries.items():
        assert prompt_path is not None
        prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

        for tag_name in ("role", "task", "input", "output"):
            assert f"<{tag_name}>" in prompt_text, (
                f"{prompt_name} prompt must define <{tag_name}>"
            )
            assert f"</{tag_name}>" in prompt_text, (
                f"{prompt_name} prompt must define </{tag_name}>"
            )


def test_cnb_research_configuration_matches_runtime_contract() -> None:
    """Keep the requested model and architecture-shaped prompt contract."""
    config = _load_llm_config()
    prompt_path = config.prompts.cnb_funding_opportunity_research
    prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

    assert config.models.funding_research.name == "gpt-5.6-terra"
    assert config.models.funding_research.reasoning_effort == "medium"
    assert "`current_filled_object`" in prompt_text
    assert "`missing_data`" in prompt_text
    assert "`funding_records`" in prompt_text
    assert "`is_opportunity`" in prompt_text
    assert "<example_output>" in prompt_text


def test_cnb_similar_project_prompt_matches_runtime_contract() -> None:
    config = _load_llm_config()
    prompt_path = config.prompts.cnb_similar_project_matching
    prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

    assert "`current_project`" in prompt_text
    assert "`selection_limit`" in prompt_text
    assert "`candidates`" in prompt_text
    assert "`matched_tags`" in prompt_text
    assert "`evidence_refs`" in prompt_text
    assert "numeric score" in prompt_text


def test_compose_prompt_wraps_core_and_chat() -> None:
    prompts = _load_llm_config().prompts

    composed_prompt = prompts.compose_prompt("chat")

    assert "<role>" in composed_prompt
    assert "You are Clima, the CityCatalyst climate assistant." in composed_prompt
    assert "<additional_instructions>" in composed_prompt
    assert "</additional_instructions>" in composed_prompt
    assert "`inventory_list_accessible`" in composed_prompt
    assert "`inventory_status_overview`" in composed_prompt
    assert "`inventory_emissions_context`" in composed_prompt
    assert "`get_all_datasources`" in composed_prompt
    assert "`climate_vector_search`" in composed_prompt
    assert (
        "Exact tool argument contracts come from the registered runtime tool definitions"
        in composed_prompt
    )
    assert (
        "Confirm by city/year only when that pair identifies one inventory"
        in composed_prompt
    )
    assert "`inventory_name`, `type`, and `gwp`" in composed_prompt
    assert "inventory_context" not in composed_prompt
    assert "Tool invocation argument contracts:" not in composed_prompt


def test_compose_prompt_wraps_core_and_stationary_energy_review() -> None:
    prompts = _load_llm_config().prompts

    raw_prompt = (CA_ROOT / "prompts" / "stationary_energy_review.md").read_text(
        encoding="utf-8"
    )
    composed_prompt = prompts.compose_prompt("stationary_energy_review")

    assert "{{ include:" in raw_prompt
    assert "{{ include:" not in composed_prompt
    assert "You are Clima, the CityCatalyst climate assistant." in composed_prompt
    assert "<additional_instructions>" in composed_prompt
    assert "Handle one Stationary Energy review intent per user turn" in composed_prompt
    assert (
        "Route the user request by choosing the first matching route" in composed_prompt
    )
    assert "Confirmation payload routes 4 and 6 take precedence" in composed_prompt
    assert "Do not start a new draft from casual affirmation" in composed_prompt
    assert "New draft / start-over UI confirmation" in composed_prompt
    assert "<tools>" in composed_prompt
    assert "</tools>" in composed_prompt
    assert "`inventory_status_overview`" in composed_prompt
    assert "`inventory_emissions_context`" in composed_prompt
    assert "`stationary_energy_start_draft`" not in composed_prompt
    assert '"go ahead" when nothing is staged yet' not in composed_prompt
    assert "`proposal_id`" in composed_prompt
    assert "`selected_source_id`" in composed_prompt
    assert "`activity_value`" in composed_prompt
    assert "`stationary_energy_accept_one`" in composed_prompt
    assert "`stationary_energy_request_bulk_review_confirmation`" in composed_prompt
    assert "`stationary_energy_save_review_draft`" in composed_prompt
    assert "save just that one" in composed_prompt
    assert "focused_decision_state" in composed_prompt
    assert "inventory_context" not in composed_prompt
    assert "Stationary Energy review tool argument contracts:" not in composed_prompt
