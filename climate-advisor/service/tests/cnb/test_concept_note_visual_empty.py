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


# Cases added with the CSS-only, <use> and canvas-title rules.
@pytest.mark.parametrize(
    "html",
    [
        # A library chart: the canvas is never drawn, only the titles show.
        (
            "<html><head><title>Emissions</title></head><body>"
            '<canvas id="c"></canvas></body></html>'
        ),
        (
            '<h2>Emissions by sector</h2><canvas id="c"></canvas>'
            '<script src="https://cdn.test/chart.js"></script>'
        ),
        # The sanitizer still drops external <use> references.
        '<svg><use href="https://cdn.test/icons.svg#i"/></svg>',
        # A selector is not a content value; empty content draws nothing.
        (
            '<style>.content:hover{color:red}.a::after{content:""}</style>'
            '<div class="content"></div>'
        ),
        # A transparent box draws nothing.
        '<div style="background:transparent;width:40px;height:10px"></div>',
    ],
)
def test_more_blank_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is False


@pytest.mark.parametrize(
    "html",
    [
        # Local references render now that the frontend keeps "#id" hrefs.
        (
            '<svg viewBox="0 0 10 10"><defs><symbol id="p"><circle r="2"/></symbol>'
            '</defs><use href="#p" x="2"/><use xlink:href="#p" x="6"/></svg>'
        ),
        # CSS-only bars: the value is in ::after and the bar is a styled box.
        (
            '<style>.bar::after{content:"412 ktCO2e"}</style>'
            '<div class="bar"></div>'
        ),
        '<div style="background:#087f8c;width:60%;height:12px"></div>',
        # A heading alone is content when no canvas is waiting to be drawn.
        "<h1>37%</h1>",
    ],
)
def test_more_visible_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is True


def test_class_painted_marks_count_as_content() -> None:
    cells = '<i class="cell"></i>' * 3
    assert has_visible_content(
        f"<style>.cell{{height:30px;background:red}}</style><div>{cells}</div>"
    )
    # One painted container (a script target) is still blank.
    assert not has_visible_content(
        '<style>#chart,.box{height:200px;background:#fff}</style><div class="box"></div>'
        "<script>draw()</script>"
    )
