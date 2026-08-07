"""
Brief: Grade saved Climate Advisor E2E responses with the configured LLM.

Inputs:
- CLI args: `--input` selects the response JSON, `--model` optionally overrides
  the configured orchestrator, and `--output` selects the report path.
- Files/paths: reads a JSON list produced by `scripts.run_ca_e2e`.
- Env vars: `OPENROUTER_API_KEY` authorizes the configured review model.

Outputs:
- Writes a JSON pass-rate report and prints a compact failed-case summary.

Usage (from project root):
- uv run --directory service python -m scripts.review_ca_e2e
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import openai
from agents import Agent, RunConfig, Runner, ToolCallOutputItem, function_tool
from agents.model_settings import ModelSettings
from agents.result import RunResult

SERVICE_ROOT = Path(__file__).resolve().parents[1]

from app.config.settings import get_settings
from app.services.openrouter_client import build_openrouter_client_options

TEST_ROOT = SERVICE_ROOT / "tests"
DEFAULT_INPUT_PATH = TEST_ROOT / "output" / "ca_e2e_responses.json"


def _configure_openrouter() -> str:
    """Apply shared OpenRouter settings to the global OpenAI client used by this script."""

    settings = get_settings()
    client_options = build_openrouter_client_options(
        settings,
        missing_api_key_message="OPENROUTER_API_KEY must be set.",
        error_cls=RuntimeError,
    )
    openai.api_key = client_options.kwargs["api_key"]
    openai.base_url = client_options.base_url
    openai.default_headers = client_options.kwargs["default_headers"]
    openai.timeout = client_options.kwargs["timeout"]
    openai.max_retries = client_options.kwargs["max_retries"]

    return settings.llm.models.orchestrator.name


@function_tool
def grade_response(decision: Literal["Yes", "No"]) -> str:
    """Return Yes if the response is good, otherwise No."""
    normalized = decision.strip().capitalize()
    if normalized not in {"Yes", "No"}:
        return "No"
    return normalized


def _load_cases(path: Path) -> List[Dict[str, Any]]:
    """Load the saved CA E2E response list from disk."""
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("CA E2E output must be a JSON list.")
    return payload


def _build_review_prompt(case: Dict[str, Any]) -> str:
    """Build the bounded grading prompt for one recorded CA E2E case."""
    # Retain only the request and response evidence needed by the grader.
    request = case.get("request") or {}
    if not isinstance(request, dict):
        request = {}

    question = request.get("content") or case.get("question") or ""
    response = case.get("response") or ""
    errors = case.get("errors") or []
    tools_used = case.get("tools_used") or []

    tool_names = []
    if isinstance(tools_used, list):
        for tool in tools_used:
            if isinstance(tool, dict) and tool.get("name"):
                tool_names.append(tool["name"])

    name = case.get("name") or "unknown"
    errors_text = json.dumps(errors, ensure_ascii=True)
    tools_text = ", ".join(tool_names) if tool_names else "none"

    return (
        "You are reviewing Climate Advisor answers.\n"
        "Call grade_response with Yes if the response is a good, direct answer.\n"
        "Call grade_response with No if the response is empty, off-topic, a refusal, or errors exist.\n"
        "Only call the tool; do not output any other text.\n\n"
        f"Case: {name}\n"
        f"Question: {question}\n"
        f"Response: {response}\n"
        f"Errors: {errors_text}\n"
        f"Tools Used: {tools_text}\n"
    )


def _extract_decision(result: RunResult) -> Optional[str]:
    """Extract the Yes/No grading tool output from an agent run result."""
    for item in result.new_items:
        if isinstance(item, ToolCallOutputItem):
            output = item.output
            if isinstance(output, str) and output in {"Yes", "No"}:
                return output
    return None


def parse_args() -> argparse.Namespace:
    """Parse response input, model override, and report destination."""
    # Keep provider selection optional so centralized configuration remains default.
    parser = argparse.ArgumentParser(
        description="Review CA E2E responses with the LLM and print pass rate.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT_PATH,
        help="Path to the CA E2E response JSON.",
    )
    parser.add_argument(
        "--model",
        type=Path,
        help="Optional model override (defaults to llm_config.yaml).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Path to save the evaluation JSON.",
    )
    return parser.parse_args()


def main() -> None:
    """Review saved CA E2E cases with the LLM and write a summary report."""
    # Validate local artifacts and configuration before starting provider calls.
    args = parse_args()

    try:
        default_model = _configure_openrouter()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc

    model = args.model or default_model
    input_path = args.input
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    try:
        cases = _load_cases(input_path)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    if not cases:
        raise SystemExit("No cases found in the input file")

    settings = get_settings()
    temperature = settings.llm.models.orchestrator.temperature
    run_config = RunConfig(
        model_settings=ModelSettings(
            tool_choice="required",
            parallel_tool_calls=False,
            temperature=temperature,
        )
    )

    agent = Agent(
        name="CA E2E Reviewer",
        instructions="Evaluate answers and call grade_response only.",
        model=model,
        tools=[grade_response],
    )

    passed = 0
    failed: List[Dict[str, str]] = []

    for case in cases:
        if not isinstance(case, dict):
            continue

        name = str(case.get("name") or "unknown")
        request = case.get("request") or {}
        question = ""
        if isinstance(request, dict):
            question = request.get("content") or ""

        prompt = _build_review_prompt(case)

        try:
            result = Runner.run_sync(agent, prompt, run_config=run_config)
        except Exception as exc:
            failed.append(
                {
                    "name": name,
                    "question": question or "(missing question)",
                    "error": f"LLM run failed: {exc}",
                }
            )
            continue

        decision = _extract_decision(result)
        if decision == "Yes":
            passed += 1
        else:
            failed.append(
                {
                    "name": name,
                    "question": question or "(missing question)",
                    "error": "Marked as No",
                }
            )

    total = passed + len(failed)
    pass_rate = (passed / total) * 100 if total else 0.0

    output_path = args.output or input_path.parent / "responses_eval.json"
    output_payload = {
        "input_path": str(input_path),
        "model": model,
        "passed": passed,
        "failed": len(failed),
        "total": total,
        "pass_rate": round(pass_rate, 1),
        "failed_cases": failed,
    }
    output_path.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")

    print(f"Pass rate: {pass_rate:.1f}% ({passed}/{total})")
    print(f"Saved evaluation to {output_path}")
    if failed:
        print("Failed cases:")
        for case in failed:
            question = case.get("question", "")
            print(f"- {case.get('name')}: {question}")
            if case.get("error"):
                print(f"  reason: {case['error']}")


if __name__ == "__main__":
    main()
