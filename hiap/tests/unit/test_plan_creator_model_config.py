"""Regression tests for plan-creator model compatibility settings."""

import ast
from pathlib import Path

import pytest


@pytest.mark.unit
def test_plan_creator_agents_disable_reasoning_for_chat_completion_tools() -> None:
    """Terra agents using Chat Completions tools must disable reasoning."""
    hiap_root = Path(__file__).parents[2]
    agent_roots = (
        hiap_root / "app/plan_creator_bundle/plan_creator/agents",
        hiap_root / "app/plan_creator_bundle/plan_creator_legacy/agents",
    )
    configured_clients = 0

    for agent_root in agent_roots:
        for source_path in agent_root.glob("agent_*.py"):
            tree = ast.parse(source_path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                if not isinstance(node.func, ast.Name) or node.func.id != "ChatOpenAI":
                    continue

                configured_clients += 1
                keyword_names = {keyword.arg for keyword in node.keywords}
                assert "temperature" not in keyword_names, source_path
                reasoning_effort = next(
                    (
                        keyword.value
                        for keyword in node.keywords
                        if keyword.arg == "reasoning_effort"
                    ),
                    None,
                )
                assert isinstance(reasoning_effort, ast.Constant), source_path
                assert reasoning_effort.value == "none", source_path

    assert configured_clients == 22


@pytest.mark.unit
def test_structured_gpt56_requests_omit_temperature() -> None:
    """GPT-5.6 structured and maintenance calls must use the default temperature."""
    hiap_root = Path(__file__).parents[2]
    source_paths = (
        hiap_root / "app/prioritizer/utils/add_explanations.py",
        hiap_root / "app/prioritizer/utils/translate_explanations.py",
        hiap_root / "app/plan_creator_bundle/plan_creator/utils/translate_plan.py",
        hiap_root / "app/prioritizer/scripts/translate_actions.py",
    )
    configured_calls = 0

    for source_path in source_paths:
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue

            keyword_names = {keyword.arg for keyword in node.keywords}
            if "reasoning_effort" not in keyword_names:
                continue

            configured_calls += 1
            assert "temperature" not in keyword_names, source_path

    assert configured_calls == 4
