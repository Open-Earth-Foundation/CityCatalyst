"""Evaluate CNB suggested-answer turns against a frozen workspace."""

from __future__ import annotations

import json
from string import ascii_uppercase
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse

from agents import (
    Agent,
    OpenAIResponsesModel,
    RunConfig,
    Runner,
    ToolCallItem,
    ToolCallOutputItem,
    function_tool,
)
from app.config import Settings
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.agent_service import stop_at_valid_question
from app.services.cnb.question_reply import (
    card_selection_message,
    chosen_label,
    current_selected_card,
    followup_card,
    option_source,
)
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.concept_note_question import (
    ConceptNoteQuestion,
    concept_note_ask_question,
    is_question_output,
    saved_question,
)
from app.utils.cnb_model_settings import cnb_model_settings
from app.utils.concept_note_context import render_source_documents_message
from app.utils.streaming_events import finalize_card_presentation
from openai import AsyncOpenAI

from benchmark.cnb.golden_set.core import LoadedFixture
from benchmark.cnb.golden_set.models import EditCase
from benchmark.cnb.golden_set.workspace import golden_id


def saved_card(
    card: ConceptNoteQuestion, message_id: str, answer: str | None
) -> dict[str, Any]:
    """Build the history shape returned by production recent_question_cards."""
    record = {
        "message_id": message_id,
        "question": card.message,
        "options": [
            {"label": label, "text": text}
            for label, text in zip(ascii_uppercase, card.options)
        ],
        "on_answer": card.on_answer,
        "document_topic": card.document_topic,
        "answer": answer,
        "answer_message_id": None,
        "choice_sources": [],
    }
    record["selected_label"] = chosen_label(record, answer) if answer else None
    return record


@function_tool
async def concept_note_edit_propose() -> str:
    """Propose precise revisions for the current user's explicit edit request.

    Use only when the user asks to change the Concept Note. The current
    instruction and scope are already bound by the UI. This tool prepares
    a proposal for review.
    """
    return '{"success":false,"error_code":"benchmark_edit_attempt"}'


def _messages(
    loaded: LoadedFixture,
    snapshots: list[WorkspaceChapterSnapshot],
    run_context: dict[str, Any],
) -> list[dict[str, str]]:
    """Render the frozen source and chapter snapshots as chat context."""
    source = loaded.fixture.source
    source_metadata = {
        "source_label": source.source_label,
        "filename": source.filename,
        "source_format": source.source_format,
    }
    bundle = {
        "workflow_step": "editing_document",
        "selected_sources": [{"source_index": 1, **source_metadata, "newest": True}],
        "cc_context": run_context.get("cc_context"),
        "document_context": {
            "chapters": [
                {"chapter_ref": s.chapter_ref, "title": s.title, "body_markdown": s.body_markdown}
                for s in snapshots
            ],
        },
        "source_text": {"mode": "full_text"},
    }
    return [
        {
            "role": "user",
            "content": "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n"
            + json.dumps(bundle, ensure_ascii=False),
        },
        {
            "role": "user",
            "content": render_source_documents_message([{**source_metadata, "text": loaded.markdown}]),
        },
    ]


async def _turn(agent: Agent, messages: list[dict[str, str]]) -> dict[str, Any]:
    """Capture a completed turn and its tool attempts without a database."""
    result = await Runner.run(
        agent,
        messages,
        max_turns=4,
        run_config=RunConfig(tracing_disabled=True, trace_include_sensitive_data=False),
    )
    calls = {
        item.call_id: item.tool_name
        for item in result.new_items
        if isinstance(item, ToolCallItem) and item.call_id and item.tool_name
    }
    output = str(result.final_output or "")
    card = next(
        (
            ConceptNoteQuestion.model_validate_json(str(item.output))
            for item in result.new_items
            if isinstance(item, ToolCallOutputItem)
            and calls.get(item.call_id) == "concept_note_ask_question"
            and is_question_output(item.output)
        ),
        None,
    )
    return {
        "card": card.model_dump() if card else None,
        "text": card.message if card else output,
        "tool_calls": list(calls.values()),
    }


async def run_chat_case(
    case: EditCase,
    loaded: LoadedFixture,
    settings: Settings,
    snapshots: list[WorkspaceChapterSnapshot],
    run_context: dict[str, Any],
) -> dict[str, Any]:
    """Run one chat turn and the selected reply turn when requested."""
    config = settings.llm.models
    role = config.cnb_chat or config.agentic_flow or config.orchestrator
    client_options = build_openrouter_client_options(
        settings,
        missing_api_key_message="OpenRouter API key is required for golden chat cases",
    )
    name = role.name
    if urlparse(client_options.base_url).hostname == "api.openai.com":
        name = name.removeprefix("openai/")
    messages = _messages(loaded, snapshots, run_context)
    messages.append({"role": "user", "content": case.instruction})
    async with AsyncOpenAI(**client_options.kwargs) as client:
        agent = Agent(
            name="Climate Advisor",
            instructions=settings.llm.prompts.compose_prompt("cnb_chat"),
            model=OpenAIResponsesModel(model=name, openai_client=client),
            model_settings=cnb_model_settings(role.reasoning_effort, temperature=role.temperature),
            tool_use_behavior=stop_at_valid_question,
            tools=[concept_note_ask_question, concept_note_edit_propose],
        )
        first = await _turn(agent, messages)
        record = {
            "case_id": case.id,
            "outcome": "question_card" if first["card"] else "chat_reply",
            "clarification": None,
            "changes": [],
            "edited_chapters": {},
            "chat_turns": [first],
            "picked_option": None,
            "reply_only": False,
            "expected_followup": None,
        }
        if not case.pick_first_option or first["card"] is None:
            return record

        card = ConceptNoteQuestion.model_validate(first["card"])
        picked = card.options[0]
        history_card = saved_card(
            card,
            str(golden_id(loaded.fixture.fixture_id, f"card/{case.id}")),
            picked,
        )
        selected = current_selected_card([history_card], picked)
        reply_only = selected is not None and selected["on_answer"] == "reply"
        record["picked_option"] = picked
        record["reply_only"] = reply_only
        history = {"tools_used": [{"name": "concept_note_ask_question", "result": first["card"]}]}
        reply_messages = [
            *messages,
            {"role": "assistant", "content": card.message},
            {
                "role": "user",
                "content": "INTERNAL_TOOL_OUTPUT_JSON\n" + json.dumps(history, ensure_ascii=False),
            },
            {"role": "user", "content": picked},
        ]
        presentation = None
        if reply_only:
            agent = agent.clone(tools=[concept_note_ask_question])
            if card.document_topic:
                source = option_source(history_card, history_card["options"][0])
                presentation = followup_card(source, "en")
                record["expected_followup"] = presentation.question.options
                reply_messages.append(card_selection_message(source, presentation))

        reply = await _turn(agent, reply_messages)
        if presentation is not None:
            invocations = []
            if reply["card"]:
                invocations.append({"name": "concept_note_ask_question", "result_json": reply["card"]})
            handler = SimpleNamespace(
                card_presentation=presentation,
                streaming_error=False,
                assistant_tokens=[],
                token_index=0,
                tool_invocations=invocations,
            )
            for _ in finalize_card_presentation(handler):
                pass
            published = saved_question(handler.tool_invocations)
            if published is not None:
                reply["card"] = published.model_dump()
                reply["text"] = published.message
        record["chat_turns"].append(reply)
    return record
