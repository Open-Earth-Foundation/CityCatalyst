"""Interactive answers validate before crossing the stream/history boundary."""

import json
from types import SimpleNamespace

import pytest
from agents.tool_context import ToolContext
from app.services.agent_service import stop_at_valid_question
from app.tools.concept_note_question import (
    INVALID_QUESTION_PREFIX,
    ConceptNoteQuestion,
    concept_note_ask_question,
    saved_question_choices,
)
from app.utils.streaming_events import handle_tool_output
from pydantic import ValidationError


@pytest.mark.parametrize(
    "options",
    [["Only"], [f"Option {i}" for i in range(13)], ["Yes", " yes "], ["", "No"]],
)
def test_invalid_options_are_rejected(options):
    with pytest.raises(ValidationError):
        ConceptNoteQuestion(message="Which next step?", options=options)


def test_only_edit_cards_accept_one_option():
    payload = {"message": "Prepare this?", "options": ["Use quarters"]}
    edit = {**payload, "on_answer": "propose_edit"}
    result = ConceptNoteQuestion.model_validate(edit).model_dump_json()
    accepted = stop_at_valid_question(
        None, [tool_result("concept_note_ask_question", result)]
    )
    assert accepted.is_final_output is True
    assert saved_question_choices(
        [{"name": "concept_note_ask_question", "result_json": json.loads(result)}]
    ) == ["Use quarters"]
    for reply in ({}, {"on_answer": "reply"}):
        with pytest.raises(ValidationError):
            ConceptNoteQuestion.model_validate({**payload, **reply})


def test_complete_rewrites_fit_in_options():
    rewrites = ["Rewrite one. " * 40, "Rewrite two. " * 40]
    question = ConceptNoteQuestion(message="Which rewrite?", options=rewrites)
    assert question.options == [rewrite.strip() for rewrite in rewrites]


@pytest.mark.parametrize("count", [8, 12])
@pytest.mark.asyncio
async def test_requested_alternatives_remain_individually_selectable_in_history(count):
    options = [f"Project title {i + 1}" for i in range(count)]
    output = await concept_note_ask_question.on_invoke_tool(
        ToolContext(
            context=None,
            tool_name="concept_note_ask_question",
            tool_call_id="titles",
            tool_arguments="",
        ),
        json.dumps({"question": {"message": "Which title?", "options": options}}),
    )
    result = json.loads(output)
    assert result["options"] == options
    assert saved_question_choices(
        [{"name": "concept_note_ask_question", "result_json": result}]
    ) == options


def tool_result(name: str, output: str) -> SimpleNamespace:
    return SimpleNamespace(tool=SimpleNamespace(name=name), output=output)


@pytest.mark.asyncio
async def test_invalid_tool_arguments_go_back_to_the_model_without_ending_the_turn():
    output = await concept_note_ask_question.on_invoke_tool(
        ToolContext(
            context=None,
            tool_name="concept_note_ask_question",
            tool_call_id="test",
            tool_arguments="",
        ),
        json.dumps({"question": {"message": "Which?", "options": ["Yes", "yes"]}}),
    )
    assert output.startswith(INVALID_QUESTION_PREFIX)
    assert "distinct" in output
    # The model gets the error and another step instead of an empty reply.
    behavior = stop_at_valid_question(
        None, [tool_result("concept_note_ask_question", output)]
    )
    assert behavior.is_final_output is False


def test_a_valid_card_ends_the_turn():
    card = json.dumps({"message": "Which?", "options": ["Yes", "No"]})
    behavior = stop_at_valid_question(
        None,
        [
            tool_result("concept_note_edit_propose", "{}"),
            tool_result("concept_note_ask_question", card),
        ],
    )
    assert behavior.is_final_output is True
    assert behavior.final_output == card


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
