"""
Review CA E2E output with the same LLM and print pass/fail summary.

Usage (from climate-advisor, with venv activated):
  python service/tests/review_ca_e2e.py

Optional flags:
  --input  Path to the CA E2E response JSON (default: service/tests/output/ca_e2e_responses.json)
  --model  Model override (default: llm_config.yaml default model)
  --output Path to save the evaluation JSON (default: <input_dir>/responses_eval.json)

Required environment:
  OPENROUTER_API_KEY

Output:
  Writes a JSON summary with pass rate and failed cases to responses_eval.json
  in the same folder as the input file (unless --output is provided).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import openai
from agents import Agent, RunConfig, Runner, ToolCallOutputItem, function_tool
from agents.model_settings import ModelSettings

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.config import get_settings

DEFAULT_INPUT_PATH = Path(__file__).parent / "output" / "ca_e2e_responses.json"


def _configure_openrouter() -> str:
    settings = get_settings()
    api_key = settings.openrouter_api_key
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY must be set.")

    base_url = settings.openrouter_base_url or "https://openrouter.ai/api/v1"
    referer = os.getenv("OPENROUTER_REFERER") or "https://citycatalyst.ai"
    title = os.getenv("OPENROUTER_TITLE") or "CityCatalyst Climate Advisor"
    timeout_ms = settings.llm.api.openrouter.timeout_ms or 30000
    retries = settings.llm.api.openrouter.retry_attempts or 2

    openai.api_key = api_key
    openai.base_url = base_url.rstrip("/")
    openai.default_headers = {
        "HTTP-Referer": referer,
        "X-Title": title,
        "Accept": "application/json",
    }
    openai.timeout = timeout_ms / 1000
    openai.max_retries = retries

    return settings.llm.models.get("default", "openai/gpt-4o")


@function_tool
def grade_response(decision: Literal["Yes", "No"]) -> str:
    """Return Yes if the response is good, otherwise No."""
    normalized = decision.strip().capitalize()
    if normalized not in {"Yes", "No"}:
        return "No"
    return normalized


def _load_cases(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("CA E2E output must be a JSON list.")
    return payload


def _build_review_prompt(case: Dict[str, Any]) -> str:
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


def _extract_decision(result) -> Optional[str]:
    for item in result.new_items:
        if isinstance(item, ToolCallOutputItem):
            output = item.output
            if isinstance(output, str) and output in {"Yes", "No"}:
                return output
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Review CA E2E responses with the LLM and print pass rate.",
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT_PATH),
        help="Path to the CA E2E response JSON.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Optional model override (defaults to llm_config.yaml).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Path to save the evaluation JSON.",
    )
    args = parser.parse_args()

    try:
        default_model = _configure_openrouter()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    model = args.model or default_model
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        cases = _load_cases(input_path)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not cases:
        print("No cases found in the input file.", file=sys.stderr)
        return 1

    settings = get_settings()
    temperature = settings.llm.generation.defaults.temperature
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

    output_path = Path(args.output) if args.output else input_path.parent / "responses_eval.json"
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
