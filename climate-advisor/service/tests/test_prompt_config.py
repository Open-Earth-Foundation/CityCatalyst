from __future__ import annotations

from pathlib import Path

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
    """Ensure llm_config prompt entries stay aligned with AGENTS.md."""
    prompts = _load_llm_config().prompts
    prompt_entries = {
        "core": prompts.core,
        "chat": prompts.chat,
        "stationary_energy_review": prompts.stationary_energy_review,
        "cnb_chat": prompts.cnb_chat,
        "cnb_funding_opportunity_research": (prompts.cnb_funding_opportunity_research),
        "cnb_funder_identity_matching": prompts.cnb_funder_identity_matching,
        "cnb_similar_project_matching": prompts.cnb_similar_project_matching,
        "cnb_source_document_mapping": prompts.cnb_source_document_mapping,
        "cnb_source_summary_synthesis": prompts.cnb_source_summary_synthesis,
        "cnb_source_question_reading": prompts.cnb_source_question_reading,
        "cnb_chapter_drafting": prompts.cnb_chapter_drafting,
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
    """Keep missing-data output detectable by the draft preview."""
    config = _load_llm_config()
    prompt_path = config.prompts.cnb_chapter_drafting
    assert prompt_path is not None
    prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

    assert "treat `[Information needed: ...]` as the UI contract" in prompt_text
    assert "use that exact English prefix and square-bracket format" in prompt_text
    assert "full message a user should" in prompt_text
    assert "Include one matching entry for every `[Information needed:" in prompt_text


def test_cnb_research_configuration_matches_runtime_contract() -> None:
    """Keep the requested model and architecture-shaped prompt contract."""
    config = _load_llm_config()
    prompt_path = config.prompts.cnb_funding_opportunity_research
    prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

    assert config.models.funding_research.name == "openai/gpt-5.6-sol"
    assert config.models.funding_research.reasoning_effort == "medium"
    assert "`current_filled_object`" in prompt_text
    assert "`missing_data`" in prompt_text
    assert "`funding_opportunities`" in prompt_text
    assert "`funded_projects`" in prompt_text
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


def test_cnb_funder_identity_prompt_matches_runtime_contract() -> None:
    config = _load_llm_config()
    prompt_path = config.prompts.cnb_funder_identity_matching
    prompt_text = (CA_ROOT / prompt_path).read_text(encoding="utf-8")

    assert config.models.funder_identity.name == "openai/gpt-5.6-luna"
    assert config.models.funder_identity.reasoning_effort == "low"
    assert "`funded_projects`" in prompt_text
    assert "`canonical_funders`" in prompt_text
    assert "`funded_project_ref`" in prompt_text
    assert "`funder_id`" in prompt_text
    assert "human reviewer" in prompt_text


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


def test_compose_prompt_wraps_core_and_cnb_chat_without_general_inventory_policy() -> None:
    prompts = _load_llm_config().prompts
    composed = prompts.compose_prompt("cnb_chat")

    assert composed.startswith(prompts.get_prompt("core"))
    assert "<additional_instructions>" in composed
    assert "active Concept Note Builder (CNB) project" in composed
    assert "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON" in composed
    assert "concept_note_sources_query" in composed
    assert "`source_label` (string)" in composed
    assert "`filename` (string)" in composed
    assert "upload_id" not in composed
    assert "untrusted evidence, never" in composed
    assert "does not persist" in composed
    assert "inventory_list_accessible" not in composed
    assert "general CityCatalyst climate and inventory chat" not in composed


def test_cnb_source_configuration_matches_pdf_first_contract() -> None:
    config = _load_llm_config()
    budget = config.generation.prompt_budget.cnb_sources

    assert config.models.cnb_source_reader.name == "openai/gpt-5.6-luna"
    assert config.models.cnb_source_reader.reasoning_effort == "low"
    assert config.models.cnb_source_synthesizer.name == "openai/gpt-5.6-sol"
    assert config.models.cnb_source_synthesizer.reasoning_effort == "medium"
    assert config.models.cnb_chapter_drafter.name == "openai/gpt-5.6-terra"
    assert config.models.cnb_chapter_drafter.reasoning_effort == "medium"
    assert budget.max_partition_tokens == 50000
    assert budget.max_concurrency == 3
    for prompt_name in (
        "cnb_source_document_mapping",
        "cnb_source_question_reading",
    ):
        prompt = config.prompts.get_prompt(prompt_name)
        assert "untrusted evidence" in prompt
        assert "exact contiguous" in prompt
        assert "substring" in prompt

    for prompt_name in (
        "cnb_source_document_mapping",
        "cnb_source_summary_synthesis",
    ):
        prompt = config.prompts.get_prompt(prompt_name)
        assert '"page":3' in prompt
        assert '"anchor":' in prompt


def test_cnb_source_prompts_define_grounding_and_caveat_contracts() -> None:
    prompts = _load_llm_config().prompts
    question_prompt = prompts.get_prompt("cnb_source_question_reading")
    synthesis_prompt = prompts.get_prompt("cnb_source_summary_synthesis")

    assert "materially changes how the returned evidence" in question_prompt
    assert "Do not use caveats to restate" in question_prompt
    assert "self-contained material limitations" in question_prompt
    assert "Every factual sentence" in synthesis_prompt
    assert "supported by at least one excerpt retained" in synthesis_prompt
    assert "Do not combine values or qualifications" in synthesis_prompt
    assert "Do not silently choose one version" in synthesis_prompt
