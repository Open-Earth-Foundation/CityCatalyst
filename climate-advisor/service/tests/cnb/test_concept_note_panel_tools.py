"""Verify the CNB switchable-panels tool, its history read and its replay compaction."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_panel_tools import concept_note_render_panels
from app.utils.concept_note_context import rendered_visuals
from app.utils.history_manager import HistoryManager
from app.utils.streaming_events import handle_tool_called, handle_tool_output
from app.utils.streaming_handler import StreamingHandler

PANELS = [
    {"label": " Overview ", "html": "<p>Retrofit 10 homes</p>"},
    {"label": "Costs", "html": "<p>EUR 125</p>"},
    # A panel of SVG shapes alone, with no HTML text, is content too.
    {"label": "Risks", "html": '<svg viewBox="0 0 9 9"><rect width="5" height="5"/></svg>'},
]


async def invoke(title: str, panels: list[dict]) -> dict:
    arguments = json.dumps({"title": title, "panels": panels})
    context = ToolContext(
        context=None,
        tool_call_id="panels-1",
        tool_name=concept_note_render_panels.name,
        tool_arguments=arguments,
    )
    return json.loads(
        await concept_note_render_panels.on_invoke_tool(context, arguments)
    )


def test_panels_schema_is_strict_label_and_html_list() -> None:
    schema = concept_note_render_panels.params_json_schema
    assert schema["required"] == ["title", "panels"]
    item = schema["$defs"]["VisualPanel"]
    assert item["required"] == ["label", "html"]
    assert item["additionalProperties"] is False


async def test_render_panels_returns_trimmed_labels_without_html() -> None:
    result = await invoke(" Retrofit plan ", PANELS)

    assert result == {
        "action": "concept_note.visual.render",
        "success": True,
        "data": {
            "title": "Retrofit plan",
            "kind": "panels",
            "labels": ["Overview", "Costs", "Risks"],
            "html_chars": sum(len(panel["html"]) for panel in PANELS),
        },
        "error_code": None,
    }


@pytest.mark.parametrize(
    ("title", "panels"),
    [
        ("", PANELS),
        ("Plan", PANELS[:1]),
        ("Plan", [*PANELS[:2], {"label": "costs", "html": "<p>x</p>"}]),
        ("Plan", [*PANELS[:2], {"label": "  ", "html": "<p>x</p>"}]),
        ("Plan", [*PANELS[:2], {"label": "x" * 41, "html": "<p>x</p>"}]),
        ("Plan", [*PANELS[:2], {"label": "Risks", "html": " "}]),
    ],
)
async def test_render_panels_rejects_invalid_input(title: str, panels: list) -> None:
    result = await invoke(title, panels)

    assert result["success"] is False
    assert result["error_code"] == "visual_invalid_input"


async def test_render_panels_rejects_oversize_total_html() -> None:
    # Each panel is under the cap, the total is not; size wins over blank.
    panels = [
        {"label": "A", "html": "<script>" + "x" * 99_983 + "</script>"},
        {"label": "B", "html": "x" * 100_001},
    ]

    result = await invoke("Plan", panels)

    assert result["error_code"] == "visual_html_too_large"
    assert result["data"] == {"html_chars": 200_001, "max_html_chars": 200_000}


async def test_render_panels_names_every_blank_panel() -> None:
    panels = [
        PANELS[0],
        {"label": " Costs ", "html": "<div id='c'></div><script>draw()</script>"},
        {"label": "Risks", "html": '<iframe srcdoc="<p>x</p>"></iframe>'},
    ]

    result = await invoke("Plan", panels)

    assert result["error_code"] == "visual_no_visible_content"
    # Trimmed labels, in display order.
    assert result["data"]["labels"] == ["Costs", "Risks"]


async def test_render_panels_names_small_svg_text_panels() -> None:
    small = '<svg viewBox="0 0 440 300"><text font-size="11">a</text></svg>'
    panels = [
        PANELS[0],
        {"label": "Costs", "html": small},
        {"label": "Risks", "html": small.replace("11", "9")},
    ]

    result = await invoke("Plan", panels)

    assert result["error_code"] == "visual_text_too_small"
    assert result["data"]["labels"] == ["Costs", "Risks"]
    assert result["data"]["smallest_text_px"] == round(9 * 320 / 440, 1)


async def test_render_panels_accepts_eight_panels() -> None:
    panels = [{"label": f"Tab {i}", "html": f"<p>{i}</p>"} for i in range(8)]

    assert (await invoke("Plan", panels))["success"] is True
    nine = [*panels, {"label": "Tab 8", "html": "<p>8</p>"}]
    assert (await invoke("Plan", nine))["error_code"] == "visual_invalid_input"


async def test_render_panels_names_panels_with_svg_animation() -> None:
    panels = [
        PANELS[0],
        {"label": "Costs", "html": "<svg><rect><animate/></rect></svg>"},
        {"label": "Risks", "html": "<svg><circle><animateMotion/></circle></svg>"},
    ]

    result = await invoke("Plan", panels)

    assert result["error_code"] == "visual_uses_svg_animation"
    assert result["data"]["labels"] == ["Costs", "Risks"]
    assert result["data"]["elements"] == ["animate", "animateMotion"]


async def test_render_panels_names_panels_with_parts_that_cannot_work() -> None:
    slider = '<input type="range"><p>Avoided 800 tCO2e</p>'

    result = await invoke("Plan", [PANELS[0], {"label": "Homes", "html": slider}])

    assert result["error_code"] == "visual_unsupported_html"
    assert result["data"]["labels"] == ["Homes"]
    assert result["data"]["features"] == ["input type=range"]


async def test_render_panels_lists_other_panels_failing_another_check() -> None:
    panels = [
        {"label": "Share", "html": "<svg><rect><animate/></rect></svg>"},
        {"label": "Flow", "html": '<div class="mermaid">graph TD\nA-->B</div>'},
        PANELS[0],
    ]

    result = await invoke("Plan", panels)

    # The first check in order is the error; the other panel gets its own step.
    assert result["error_code"] == "visual_needs_svg"
    assert result["data"]["labels"] == ["Flow"]
    [other] = result["data"]["other_panel_errors"]
    assert other["label"] == "Share"
    assert other["error_code"] == "visual_uses_svg_animation"
    assert other["elements"] == ["animate"]
    assert "@keyframes" in other["next_step"]


async def test_history_reads_panels_from_arguments_with_result_labels() -> None:
    result = await invoke("Retrofit plan", PANELS)
    ok = {
        "name": "concept_note_render_panels",
        "arguments": {"title": "Retrofit plan", "panels": PANELS},
        "result_json": result,
    }
    failed = {**ok, "result_json": {**result, "success": False}}

    # Labels come trimmed from the result; a failed call shows nothing.
    assert rendered_visuals([ok, failed]) == [
        {
            "title": "Retrofit plan",
            "panels": [
                {"label": label, "html": panel["html"]}
                for label, panel in zip(["Overview", "Costs", "Risks"], PANELS)
            ],
        }
    ]


async def test_panels_stream_once_persist_and_replay_without_html() -> None:
    """Live SSE, stored row and model replay use the normal visual paths."""
    handler = StreamingHandler(
        thread_id="thread-1", user_id="user-1", session_factory=MagicMock()
    )
    panels = [
        {"label": label, "html": f"<p>{label} " + "x" * 300 + "</p>"}
        for label in ("Overview", "Costs", "Risks")
    ]
    arguments = json.dumps({"title": "Plan", "panels": panels})
    output = await concept_note_render_panels.on_invoke_tool(
        ToolContext(
            context=None,
            tool_call_id="call-1",
            tool_name=concept_note_render_panels.name,
            tool_arguments=arguments,
        ),
        arguments,
    )
    called = SimpleNamespace(
        raw_item=SimpleNamespace(
            name="concept_note_render_panels", call_id="call-1", arguments=arguments
        )
    )
    finished = SimpleNamespace(raw_item=SimpleNamespace(call_id="call-1"), output=output)

    tool_called = b"".join([c async for c in handle_tool_called(handler, called)])
    tool_output = b"".join([c async for c in handle_tool_output(handler, finished)])
    done = handler._format_completion_event("req-1", ok=True)

    # The live tool_called event names the panels but streams no HTML; the
    # done event carries each body exactly once for the chat to render.
    assert b"Overview" in tool_called and b"x" * 300 not in tool_called
    streamed = (tool_called + tool_output + done).decode("utf-8")
    for panel in panels:
        assert streamed.count(panel["html"]) == 1
    stored = handler._tool_invocations_for_persistence()
    assert rendered_visuals(stored) == [{"title": "Plan", "panels": panels}]

    # Replay keeps the labels, omits the HTML and leaves the stored row intact.
    replay = HistoryManager("thread-1", "user-1", None)._tool_context_to_messages(
        stored
    )
    replay_text = json.dumps(replay)
    assert "Costs" in replay_text and "x" * 300 not in replay_text
    assert rendered_visuals(stored) == [{"title": "Plan", "panels": panels}]
