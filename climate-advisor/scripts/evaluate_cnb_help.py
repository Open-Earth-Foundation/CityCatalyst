"""Evaluate automatic CNB help-tool selection with real configured model calls.

Inputs: --output JSON path; optional --locale UI language (default en); existing service provider credentials/environment and
llm_config.yaml. Reads the five original CC-860 questions. Persistence is replaced
with the original four-chapter, 25-gap fixture; only the real help tool may execute.
Outputs: raw answers, tool calls, usage, and fixture/scope metadata as JSON.
No project data is changed. This is an API evaluation, not a browser test.

Usage from climate-advisor (PYTHONPATH=service):
    python -m scripts.evaluate_cnb_help --output ../docs/testing/CC-860-help-results.json
    python -m scripts.evaluate_cnb_help --locale pt --output ../docs/testing/CC-860-help-results-pt.json
"""

import argparse
import asyncio
import json
import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from agents import RunConfig, Runner
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.services.agent_service import AgentService
from app.services.cnb.ui_context import build_ui_state

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse the results destination and simulated UI language."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Results JSON path")
    parser.add_argument("--locale", default="en", help="Frontend UI language code")
    return parser.parse_args()


async def evaluate(output: Path, ui_locale: str) -> None:
    """Run isolated turns through the production agent and help tool."""
    root = Path(__file__).resolve().parents[2]
    questions = json.loads(
        (root / "docs/testing/CC-860-cnb-navigation-answers.json").read_text(
            encoding="utf-8-sig"
        )
    )
    questions.extend(
        [
            {"number": 6, "prompt": "What can you do in this concept note builder?"},
            {
                "number": 7,
                "prompt": "Which funder and programme are selected for this project?",
            },
        ]
    )
    context = {
        "workflow_step": "editing_document",
        "document_context": None,
        "selected_sources": [],
        "funder_context": {
            "funder": "European Union LIFE Programme",
            "programme": "EUCF Call 7",
        },
    }
    chapters = [
        SimpleNamespace(
            status="needs_review",
            body_markdown="Fixture draft",
            gaps=[
                SimpleNamespace(severity="critical", state="open") for _ in range(count)
            ],
        )
        for count in [7, 6, 6, 6]
    ]
    state = build_ui_state(chapters)
    report = {
        "scope": "Real model and production agent/tool; fixture persistence; no browser/deployment test",
        "context": context,
        "ui_locale": ui_locale,
        "ui_state": state,
        "results": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)

    # Substitute only persistence; preserve configured prompt, model, and tool selection.
    with (
        patch(
            "app.services.agent_service.load_agent_context",
            new=AsyncMock(return_value=context),
        ),
        patch(
            "app.tools.concept_note_help_tools.load_agent_context",
            new=AsyncMock(return_value=context),
        ),
        patch(
            "app.tools.concept_note_help_tools.load_ui_state",
            new=AsyncMock(return_value=state),
        ),
    ):
        for question in questions:
            service = AgentService(
                cc_user_id="evaluation-owner",
                cc_thread_id=uuid4(),
                concept_note_run_id=uuid4(),
                session_factory=MagicMock(),
                concept_note_ui_locale=ui_locale,
                concept_note_edit_request=EditProposalRequest(
                    instruction=question["prompt"], idempotency_key=uuid4()
                ),
            )
            try:
                agent = await service.create_agent(model=service.cnb_chat_model)

                async def reject_non_help(ctx: object, args: str) -> str:
                    """Prevent unintended source/edit execution in this fixture evaluation."""
                    raise RuntimeError("Unexpected non-help tool selected")

                for tool in agent.tools:
                    if tool.name != "concept_note_help":
                        tool.on_invoke_tool = reject_non_help
                result = await Runner.run(
                    agent,
                    [
                        {
                            "role": "user",
                            "content": "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n"
                            + json.dumps(context),
                        },
                        {"role": "user", "content": question["prompt"]},
                    ],
                    max_turns=4,
                    run_config=RunConfig(tracing_disabled=True),
                )
                calls = [
                    item.raw_item.name
                    for item in result.new_items
                    if item.type == "tool_call_item"
                ]
                row = {
                    "number": question["number"],
                    "prompt": question["prompt"],
                    "answer": result.final_output,
                    "tool_calls": calls,
                    "model": agent.model.model,
                    "usage": [
                        {
                            "input_tokens": r.usage.input_tokens,
                            "output_tokens": r.usage.output_tokens,
                        }
                        for r in result.raw_responses
                    ],
                }
                report["results"].append(row)
                output.write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                logger.info(
                    "Completed question %s: tools=%s", question["number"], calls
                )
            finally:
                await service.close()


def main() -> None:
    """Run the evaluation with concise progress logging."""
    logging.basicConfig(level=logging.WARNING)
    logger.setLevel(logging.INFO)
    args = parse_args()
    asyncio.run(evaluate(args.output, args.locale))


if __name__ == "__main__":
    main()
