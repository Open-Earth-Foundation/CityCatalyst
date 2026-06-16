from __future__ import annotations

from app.config.settings import _load_llm_config
from app.config.settings import PromptsConfig


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


def test_stationary_energy_review_prompt_has_rendered_tools_section() -> None:
    prompts = _load_llm_config().prompts

    rendered_prompt = prompts.get_prompt("stationary_energy_review")

    assert "{{ include:" not in rendered_prompt
    assert "<tools>" in rendered_prompt
    assert "</tools>" in rendered_prompt
    assert "`stationary_energy_accept_one`" in rendered_prompt
    assert "`stationary_energy_request_bulk_review_confirmation`" in rendered_prompt
    assert "`stationary_energy_save_review_draft`" in rendered_prompt
    assert "save just that one" in rendered_prompt
    assert "focused_decision_state" in rendered_prompt
