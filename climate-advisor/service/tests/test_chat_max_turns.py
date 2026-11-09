"""Turn limit for streamed chat: configuration, regression, and partial answer."""

import json
from types import SimpleNamespace

import pytest
from agents import FunctionTool
from app.config import get_settings
from app.config.settings import _load_llm_config
from app.utils.max_turns_handler import (
    build_partial_answer,
    summarize_catalog_progress,
)

from tests.test_stream_resilience import (
    ProviderStream,
    _answer,
    _completed,
    _event,
    _tool_call,
    chat,  # noqa: F401  (fixture)
)

INVENTORY_A = "11111111-1111-4111-8111-111111111111"
INVENTORY_B = "22222222-2222-4222-8222-222222222222"


def _loop_tool(calls: list[str]) -> FunctionTool:
    """Build a tool the model can call forever."""

    async def loop(context, arguments):
        calls.append(arguments)
        return "again"

    return FunctionTool(
        name="update_note",
        description="Update a note",
        params_json_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
            "required": [],
        },
        on_invoke_tool=loop,
    )


def _tool_turn() -> ProviderStream:
    call = _tool_call()
    return ProviderStream(
        [
            _event(
                "response.output_item.added",
                output_index=0,
                item={**call, "status": "in_progress"},
            ),
            _event("response.output_item.done", output_index=0, item=call),
            _completed([call]),
        ]
    )


def test_default_max_agent_turns_is_sixteen() -> None:
    assert get_settings().llm.chat.max_agent_turns == 16


def test_env_var_overrides_max_agent_turns(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_MAX_AGENT_TURNS", "4")

    assert _load_llm_config().chat.max_agent_turns == 4


async def test_chat_without_tools_is_unchanged_by_the_turn_limit(chat) -> None:  # noqa: F811
    result = await chat(ProviderStream(_answer()))

    assert len(result.requests) == 1
    assert result.text == "Recovered answer"
    assert result.done["ok"] is True


async def test_endless_tool_loop_stops_at_sixteen_turns_with_a_partial_answer(
    chat,  # noqa: F811
) -> None:
    calls: list[str] = []

    result = await chat(_tool_turn(), tools=[_loop_tool(calls)])

    assert len(result.requests) == 16
    assert len(calls) == 16
    assert "step limit" in result.text
    assert "new message" in result.text
    assert result.done["ok"] is True


async def test_turn_limit_is_read_from_settings(chat, monkeypatch) -> None:  # noqa: F811
    monkeypatch.setattr(get_settings().llm.chat, "max_agent_turns", 3)

    result = await chat(_tool_turn(), tools=[_loop_tool([])])

    assert len(result.requests) == 3
    assert "step limit" in result.text


def _call_item(call_id: str, name: str, arguments: dict) -> SimpleNamespace:
    return SimpleNamespace(
        type="tool_call_item",
        raw_item=SimpleNamespace(
            call_id=call_id, name=name, arguments=json.dumps(arguments)
        ),
    )


def _output_item(call_id: str, output: dict) -> SimpleNamespace:
    return SimpleNamespace(
        type="tool_call_output_item",
        raw_item={"call_id": call_id},
        output=json.dumps(output),
    )


def _list_output() -> dict:
    return {
        "success": True,
        "data": {
            "cities": [
                {
                    "name": "Curitiba",
                    "inventories": [{"inventory_id": INVENTORY_A, "year": 2022}],
                },
                {
                    "name": "Recife",
                    "inventories": [{"inventory_id": INVENTORY_B, "year": 2023}],
                },
            ]
        },
    }


_ACTION_NAMES = [
    "Solar rooftops",
    "Bus fleet",
    "LED lighting",
    "Tidal pilot",
    "Wetland sink",
    "Cycle lanes",
    "Tree canopy",
]


def _read_output(count: int = 1) -> dict:
    return {
        "success": True,
        "data": {
            "categories": {
                "mitigation": {
                    "actions": [
                        {"rank": rank, "name": name, "selected": rank == 1}
                        for rank, name in enumerate(_ACTION_NAMES[:count], start=1)
                    ]
                }
            }
        },
    }


def test_progress_names_answered_and_pending_cities() -> None:
    items = [
        _call_item("c1", "inventory_list_accessible", {}),
        _output_item("c1", _list_output()),
        _call_item("c2", "native_input_discover", {"inventoryId": INVENTORY_A}),
        _output_item("c2", {"success": True, "data": {"entries": []}}),
        _call_item(
            "c3",
            "native_input_read",
            {"inventoryId": INVENTORY_A, "catalogId": "x", "capabilityId": "y"},
        ),
        _output_item("c3", _read_output()),
        _call_item("c4", "native_input_discover", {"inventoryId": INVENTORY_B}),
        _output_item("c4", {"success": True, "data": {"entries": []}}),
    ]

    progress = summarize_catalog_progress(items)
    message = build_partial_answer(progress)

    assert progress["answered"] == ["Curitiba 2022"]
    assert progress["pending"] == ["Recife 2023"]
    assert "Already read: Curitiba 2022: #1 Solar rooftops." in message
    assert "Not finished: Recife 2023." in message
    assert "new message" in message


def test_progress_without_catalog_calls_still_asks_for_a_new_message() -> None:
    message = build_partial_answer(summarize_catalog_progress([]))

    assert "step limit" in message
    assert "Already read" not in message
    assert "new message" in message


def test_partial_answer_keeps_the_retrieved_ranking_after_a_successful_read() -> None:
    items = [
        _call_item("c1", "inventory_list_accessible", {}),
        _output_item("c1", _list_output()),
        _call_item(
            "c2",
            "native_input_read",
            {"inventoryId": INVENTORY_B, "catalogId": "x", "capabilityId": "y"},
        ),
        _output_item("c2", _read_output(count=7)),
    ]

    message = build_partial_answer(summarize_catalog_progress(items))

    assert "#1 Solar rooftops" in message
    assert "#5 Wetland sink" in message
    assert "#6" not in message
    assert "and 2 more" in message
    assert "Not finished" not in message


def test_partial_answer_includes_reads_of_the_default_chat_inventory() -> None:
    items = [
        _call_item("c1", "native_input_discover", {}),
        _output_item("c1", {"success": True, "data": {"entries": []}}),
        _call_item("c2", "native_input_read", {"catalogId": "x", "capabilityId": "y"}),
        _output_item("c2", _read_output()),
    ]

    progress = summarize_catalog_progress(items)
    message = build_partial_answer(progress)

    assert progress["answered"] == ["your current inventory"]
    assert "your current inventory: #1 Solar rooftops." in message


def test_a_successful_read_without_usable_actions_is_marked_unfinished() -> None:
    items = [
        _call_item("c1", "inventory_list_accessible", {}),
        _output_item("c1", _list_output()),
        _call_item(
            "c2",
            "native_input_read",
            {"inventoryId": INVENTORY_A, "catalogId": "x", "capabilityId": "y"},
        ),
        _output_item("c2", {"success": True, "data": {}}),
    ]

    progress = summarize_catalog_progress(items)
    message = build_partial_answer(progress)

    assert progress["answered"] == []
    assert progress["pending"] == ["Curitiba 2022"]
    assert "Not finished: Curitiba 2022." in message
    assert "Already read" not in message
