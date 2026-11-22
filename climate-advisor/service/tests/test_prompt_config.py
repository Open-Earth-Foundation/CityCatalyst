"""Prompt files load, resolve includes, and compose with the shared core prompt."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config.settings import PromptsConfig, _load_llm_config

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
        cnb_funder_identity_matching=str(prompt_path),
        cnb_similar_project_matching=str(prompt_path),
    )

    rendered_prompt = prompts.get_prompt("chat")

    assert "{{ include:" not in rendered_prompt
    assert "`example_tool`" in rendered_prompt


def test_configured_prompt_files_use_required_schema_blocks() -> None:
    """Ensure llm_config prompt entries exist and stay aligned with AGENTS.md."""
    prompts = _load_llm_config().prompts
    prompt_entries = {
        "cnb_chat_suggestions": prompts.cnb_chat_suggestions,
        "core": prompts.core,
        "chat": prompts.chat,
        "stationary_energy_review": prompts.stationary_energy_review,
        "cnb_chat": prompts.cnb_chat,
        "cnb_chat_edit_planner": prompts.cnb_chat_edit_planner,
        "cnb_chat_edit_review": prompts.cnb_chat_edit_review,
        "cnb_funding_opportunity_research": (prompts.cnb_funding_opportunity_research),
        "cnb_funder_identity_matching": prompts.cnb_funder_identity_matching,
        "cnb_similar_project_matching": prompts.cnb_similar_project_matching,
        "cnb_source_document_mapping": prompts.cnb_source_document_mapping,
        "cnb_source_summary_synthesis": prompts.cnb_source_summary_synthesis,
        "cnb_source_question_reading": prompts.cnb_source_question_reading,
        "cnb_source_chapter_evidence": prompts.cnb_source_chapter_evidence,
        "cnb_source_chapter_evidence_selection": (
            prompts.cnb_source_chapter_evidence_selection
        ),
        "cnb_chapter_drafting": prompts.cnb_chapter_drafting,
        "cnb_chapter_support_check": prompts.cnb_chapter_support_check,
        "cnb_source_impact_review": prompts.cnb_source_impact_review,
        "cnb_draft_overview": prompts.cnb_draft_overview,
        "cnb_chapter_validation_completeness": (
            prompts.cnb_chapter_validation_completeness
        ),
        "cnb_chapter_validation_consistency": (
            prompts.cnb_chapter_validation_consistency
        ),
        "cnb_chapter_validation_answered_gaps": (
            prompts.cnb_chapter_validation_answered_gaps
        ),
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


def test_cnb_chapter_drafting_prompt_defines_missing_information_ui_contract() -> None:
    """The draft preview detects missing data by this exact marker."""
    prompt = _load_llm_config().prompts.get_prompt("cnb_chapter_drafting")

    assert "treat `[Information needed: ...]` as the UI contract" in prompt


@pytest.mark.parametrize(
    "prompt_name, excluded_policy",
    [
        ("chat", None),
        ("stationary_energy_review", None),
        # CNB chat must not inherit the general inventory-chat tool policy.
        ("cnb_chat", "inventory_list_accessible"),
    ],
)
def test_compose_prompt_wraps_core_and_resolves_includes(
    prompt_name: str, excluded_policy: str | None
) -> None:
    prompts = _load_llm_config().prompts

    composed = prompts.compose_prompt(prompt_name)

    assert composed.startswith(prompts.get_prompt("core"))
    assert "<additional_instructions>" in composed
    assert "{{ include:" not in composed
    if excluded_policy is not None:
        assert excluded_policy not in composed
