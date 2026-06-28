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
    prompt_path = tmp_path / "default.md"
    prompt_path.write_text(
        "<tools>\n{{ include: tools/default_tool_policy.md }}\n</tools>",
        encoding="utf-8",
    )

    prompts = PromptsConfig(default=str(prompt_path))

    rendered_prompt = prompts.get_prompt("default")

    assert "{{ include:" not in rendered_prompt
    assert "`example_tool`" in rendered_prompt


def test_default_prompt_uses_shared_inventory_flow() -> None:
    rendered_prompt = _load_llm_config().prompts.get_prompt("default")

    assert "{{ include:" not in rendered_prompt
    assert "`inventory_list_accessible`" in rendered_prompt
    assert "`inventory_status_overview`" in rendered_prompt
    assert "`inventory_emissions_context`" in rendered_prompt
    assert "`get_all_datasources`" in rendered_prompt
    assert "`climate_vector_search`" in rendered_prompt
    assert "`get_user_inventories`" not in rendered_prompt
    assert "`city_inventory_search`" not in rendered_prompt
    assert "`get_inventory`" not in rendered_prompt


def test_stationary_energy_review_prompt_has_rendered_tools_section() -> None:
    prompts = _load_llm_config().prompts

    raw_prompt = (CA_ROOT / "prompts" / "stationary_energy_review.md").read_text(
        encoding="utf-8"
    )
    rendered_prompt = prompts.get_prompt("stationary_energy_review")

    assert "{{ include:" not in raw_prompt
    assert "{{ include:" not in rendered_prompt
    assert "You are Clima" in rendered_prompt
    assert "Handle one Stationary Energy review intent per user turn" in rendered_prompt
    assert "Route the user request by choosing the first matching route" in rendered_prompt
    assert "Confirmation payload routes 4 and 6 take precedence" in rendered_prompt
    assert "<tools>" in rendered_prompt
    assert "</tools>" in rendered_prompt
    assert "`proposal_id`" in rendered_prompt
    assert "`selected_source_id`" in rendered_prompt
    assert "`activity_value`" in rendered_prompt
    assert "`inventory_status_overview`" in rendered_prompt
    assert "`inventory_emissions_context`" in rendered_prompt
    assert "`stationary_energy_accept_one`" in rendered_prompt
    assert "`stationary_energy_request_bulk_review_confirmation`" in rendered_prompt
    assert "`stationary_energy_save_review_draft`" in rendered_prompt
    assert "save just that one" in rendered_prompt
    assert "focused_decision_state" in rendered_prompt
