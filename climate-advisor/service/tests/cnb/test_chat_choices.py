"""Interactive answers validate before crossing the stream/history boundary."""

import json
from types import SimpleNamespace

import pytest
from agents import ModelBehaviorError
from agents.tool_context import ToolContext
from app.tools.concept_note_question import (
    ConceptNoteQuestion,
    concept_note_ask_question,
    saved_question_choices,
)
from app.utils.streaming_events import handle_tool_output
from pydantic import ValidationError


@pytest.mark.parametrize("options", [["Only"], ["A"] * 7, ["Yes", " yes "], ["", "No"]])
def test_invalid_options_are_rejected(options):
    with pytest.raises(ValidationError):
        ConceptNoteQuestion(message="Which next step?", options=options)


def test_complete_rewrites_fit_in_options():
    rewrites = ["Rewrite one. " * 40, "Rewrite two. " * 40]
    question = ConceptNoteQuestion(message="Which rewrite?", options=rewrites)
    assert question.options == [rewrite.strip() for rewrite in rewrites]


@pytest.mark.asyncio
async def test_invalid_tool_arguments_raise_instead_of_finishing_an_empty_reply():
    with pytest.raises(ModelBehaviorError):
        await concept_note_ask_question.on_invoke_tool(
            ToolContext(
                context=None,
                tool_name="concept_note_ask_question",
                tool_call_id="test",
                tool_arguments="",
            ),
            json.dumps({"question": {"message": "Which?", "options": ["Yes", "yes"]}}),
        )


@pytest.mark.asyncio
async def test_question_stream_persists_prose_and_only_exposes_validated_choices():
    question = {
        "message": "Where should we start?",
        "options": ["Budget", "Partners", "Scope"],
    }
    handler = SimpleNamespace(
        tool_invocations=[
            {"id": "call", "name": "concept_note_ask_question", "status": "executing"}
        ],
        assistant_tokens=[],
        token_index=0,
        _pending_tool_observations={},
        _tool_observation_records=[],
        token_handler=None,
    )
    item = SimpleNamespace(raw_item={"call_id": "call"}, output=json.dumps(question))
    events = [event.decode() async for event in handle_tool_output(handler, item)]
    assert handler.assistant_tokens == [question["message"]]
    assert sum("event: message\n" in event for event in events) == 1
    assert any(
        '"options"' in event and "event: tool_result" in event for event in events
    )
    assert saved_question_choices(handler.tool_invocations) == question["options"]
    assert (
        saved_question_choices([{"name": "different_tool", "result_json": question}])
        is None
    )
    assert (
        saved_question_choices(
            [{"name": "concept_note_ask_question", "result_json": {"options": ["x"]}}]
        )
        is None
    )
