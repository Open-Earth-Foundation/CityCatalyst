"""Verify the render-visual tool rejects HTML that would render as a blank card."""

import json

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.visual_html import has_visible_content

# Content the chat sanitizer drops or never draws.
BLANK = [
    (
        "<!doctype html><html><body><script>document.body.innerHTML='<h1>42</h1>'"
        "</script></body></html>"
    ),
    (
        '<div id="chart" style="height:300px"></div>'
        '<script src="https://cdn.test/chart.js"></script>'
    ),
    (
        "<html><head><title>Emissions</title><style>body{color:red}</style></head>"
        "<body>\n &nbsp; <!-- 42 tCO2e --></body></html>"
    ),
    '<canvas id="c" width="300" height="200"></canvas>',
    '<iframe srcdoc="<p>42</p>"></iframe><noscript>Enable JS</noscript>',
    "<template><p>42</p></template>",
    "<svg><foreignObject><p>42 tCO2e</p></foreignObject></svg>",
    "<canvas>Your browser does not support canvas</canvas>",
    '<img src="https://cdn.test/chart.png" alt="">',
    "<svg></svg>",
    (
        '<svg viewBox="0 0 10 10"><title>Chart</title><defs><linearGradient id="g">'
        '</linearGradient></defs><image href="https://cdn.test/a.png"/></svg>'
    ),
]
# Legitimate static visuals, including ones with no HTML text at all.
VISIBLE = [
    "<table><tr><td>1</td></tr></table>",
    '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg>',
    "<svg><text>Label</text></svg>",
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Chart">',
    '<a href="https://evil.test">Source: City inventory 2023</a>',
    "<details><summary>Design</summary>Phase 1</details>",
    "<label><input type=radio name=t checked></label>",
    "<p>42 tCO2e</p><script>alert(1)</script>",
]


@pytest.mark.parametrize("html", BLANK)
def test_blank_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is False


@pytest.mark.parametrize("html", VISIBLE)
def test_visible_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is True


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


async def test_tool_reports_blank_html_with_one_retry_hint() -> None:
    result = await invoke("Emissions", BLANK[0])

    assert result["success"] is False
    assert result["error_code"] == "visual_no_visible_content"
    assert "Retry once" in result["data"]["next_step"]
    assert "answer in text" in result["data"]["next_step"]


async def test_tool_accepts_svg_without_html_text() -> None:
    result = await invoke("Bars", VISIBLE[1])

    assert result["success"] is True
