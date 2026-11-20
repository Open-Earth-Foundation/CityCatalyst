"""Verify the CNB render-visual tool's validation and result envelope."""

import json

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.visual_html import smallest_svg_text_px

HTML = "<!doctype html><html><body><table><tr><td>1</td></tr></table></body></html>"


async def invoke(title: str, html: str) -> dict:
    arguments = json.dumps({"title": title, "html": html})
    context = ToolContext(
        context=None,
        tool_call_id="visual-1",
        tool_name=concept_note_render_visual.name,
        tool_arguments=arguments,
    )
    return json.loads(
        await concept_note_render_visual.on_invoke_tool(context, arguments)
    )


async def test_render_visual_returns_title_and_size_without_html() -> None:
    result = await invoke("Emissions by sector", HTML)

    assert result == {
        "action": "concept_note.visual.render",
        "success": True,
        "data": {"title": "Emissions by sector", "html_chars": len(HTML)},
        "error_code": None,
    }


async def test_render_visual_trims_title() -> None:
    result = await invoke("  Theory of change \n", HTML)

    assert result["success"] is True
    assert result["data"]["title"] == "Theory of change"


@pytest.mark.parametrize(
    ("title", "html"),
    [("", HTML), ("   ", HTML), ("x" * 201, HTML), ("Chart", "  ")],
)
async def test_render_visual_rejects_invalid_input(title: str, html: str) -> None:
    result = await invoke(title, html)

    assert result["success"] is False
    assert result["data"] is None
    assert result["error_code"] == "visual_invalid_input"


async def test_render_visual_rejects_oversize_html() -> None:
    html = "x" * 200_001

    result = await invoke("Chart", html)

    assert result["success"] is False
    assert result["error_code"] == "visual_html_too_large"
    assert result["data"] == {"html_chars": 200_001, "max_html_chars": 200_000}
    assert (await invoke("Chart", "x" * 200_000))["success"] is True


SMALL_TEXT_SVG = '<svg viewBox="0 0 440 300"><text font-size="11">a</text></svg>'


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        # 11 px text in a 440-wide viewBox shrinks to 8 px in the 320 px column.
        (SMALL_TEXT_SVG, 8.0),
        # Mini charts (viewBox up to 200 wide) are drawn 140 px wide instead.
        (
            '<svg viewBox="0 0 160 100"><text font-size="11">a</text></svg>',
            11 * 140 / 160,
        ),
        (
            '<svg viewBox="0 0 150 100"><text font-size="13">a</text></svg>',
            13 * 140 / 150,
        ),
        # A 320-wide viewBox is not enlarged or shrunk.
        ('<svg viewBox="0 0 320 200"><g font-size="12"><text>a</text></g></svg>', 12.0),
        # Nested svgs use the top-level scale; the inner viewBox is ignored.
        (
            '<svg viewBox="0 0 440 300"><g><svg viewBox="0 0 100 100">'
            '<text font-size="6">n</text></svg></g></svg>',
            6 * 320 / 440,
        ),
        # Text with no size takes the stylesheet default for svg text.
        ('<style>svg text{font-size:9px}</style><svg><text>a</text></svg>', 9.0),
        # em and keyword sizes are unknown, so the check is skipped.
        (
            '<svg viewBox="0 0 320 100"><text style="font-size:0.6em">a</text></svg>',
            None,
        ),
        # Empty or whitespace text and text outside svg are not drawn as svg text.
        ('<svg><text font-size="12"> </text></svg>', None),
        ('<text font-size="5">html</text>', None),
        ("<p>42 tCO2e</p>", None),
    ],
)
def test_smallest_svg_text_px(html: str, expected: float | None) -> None:
    assert smallest_svg_text_px(html) == expected


async def test_tool_rejects_svg_text_below_minimum_with_one_retry_hint() -> None:
    result = await invoke("Emissions", SMALL_TEXT_SVG)

    assert result["success"] is False
    assert result["error_code"] == "visual_text_too_small"
    assert result["data"]["smallest_text_px"] == 8.0
    assert "viewBox width 320" in result["data"]["next_step"]
    assert "150 for mini charts" in result["data"]["next_step"]
    assert "retry once" in result["data"]["next_step"]


async def test_tool_accepts_svg_text_at_minimum_size() -> None:
    svg = '<svg viewBox="0 0 320 200"><text font-size="12">a</text></svg>'

    assert (await invoke("Emissions", svg))["success"] is True
