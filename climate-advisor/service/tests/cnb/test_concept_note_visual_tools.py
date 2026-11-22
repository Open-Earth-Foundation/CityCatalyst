"""Verify the CNB render-visual tool's validation and result envelope."""

import json

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.visual_html import (
    needs_svg,
    unsupported_html_features,
)

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


async def test_tool_reports_blank_html_with_one_retry_hint() -> None:
    result = await invoke("Chart", '<div id="c"></div><script>draw()</script>')

    assert result["error_code"] == "visual_no_visible_content"
    assert "Retry once" in result["data"]["next_step"]
    assert "answer in text" in result["data"]["next_step"]


MERMAID = '<pre class="mermaid">flowchart TD\n  A[Baseline] --> B[Target]</pre>'


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        (MERMAID, True),
        ('<div class="language-mermaid">A --> B</div>', True),
        ("<pre><code>graph LR\nA-->B</code></pre>", True),
        ("<pre>classDiagram\n  Animal <|-- Duck</pre>", True),
        # Prose that starts like source or mentions a chart type is not source.
        ("<p>classDiagram is the Mermaid keyword for class charts.</p>", False),
        ("<p>Pie chart of sectors: energy 412 ktCO2e</p>", False),
        # A drawn SVG next to the source is fine.
        (MERMAID + '<svg viewBox="0 0 320 90"><rect width="9"/></svg>', False),
        # A canvas is never drawn without scripts, even next to an SVG.
        ('<svg viewBox="0 0 320 90"><rect width="9"/></svg><canvas></canvas>', True),
    ],
)
def test_needs_svg(html: str, expected: bool) -> None:
    assert needs_svg(html) is expected


async def test_tool_rejects_mermaid_source_with_one_retry_hint() -> None:
    result = await invoke("Flow", MERMAID)

    assert result["error_code"] == "visual_needs_svg"
    assert "inline SVG" in result["data"]["next_step"]


async def test_tool_rejects_svg_animation_elements() -> None:
    svg = '<svg viewBox="0 0 320 100"><rect><animate/><set/></rect></svg>'

    result = await invoke("Bars", svg)

    assert result["error_code"] == "visual_uses_svg_animation"
    assert result["data"]["elements"] == ["animate", "set"]
    assert "@keyframes" in result["data"]["next_step"]


async def test_tool_accepts_css_keyframe_animation() -> None:
    html = (
        "<style>@keyframes grow{from{transform:scaleX(0)}}rect{animation:grow 1s}"
        '</style><svg viewBox="0 0 320 100"><rect width="200" height="20"/></svg>'
    )
    assert (await invoke("Bars", html))["success"] is True


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        # Parts that show in the chat but do nothing there.
        ('<p id="v">calculating</p><script>v.textContent="125"</script>', ["script"]),
        ('<p onclick="go()">Buildings 455</p>', ["script"]),
        ("<button>Show 2024</button><p>2023: 455</p>", ["button"]),
        ('<input type="range"><output>0</output>', ["input type=range"]),
        ('<style>.t:target{display:block}</style><p class="t">455</p>', [":target"]),
        (
            '<svg viewBox="0 0 9 9"><foreignObject><p>4</p></foreignObject></svg>',
            ["foreignObject"],
        ),
        (
            '<iframe src="https://e.org/map"></iframe><object></object>',
            ["embedded frame"],
        ),
        ('<img src="https://e.org/a.jpg" alt="site">', ["external resource"]),
        ('<style>@import "x.css";</style><p>455</p>', ["external resource"]),
        ('<p style="background:url(//cdn.e.org/x.png)">455</p>', ["external resource"]),
        # Native controls, popovers, local references and data: URLs work.
        (
            '<input type="radio" id="a" checked><input type="checkbox"><select></select>',
            [],
        ),
        ('<button popovertarget="p">Details</button><div popover id="p">455</div>', []),
        (
            '<img src="data:image/png;base64,AA" alt="ok"><svg viewBox="0 0 9 9">'
            '<rect fill="url(#g)"/></svg><style>/* :target */ b{background:url(data:,x)}</style>',
            [],
        ),
    ],
)
def test_unsupported_html_features(html: str, expected: list[str]) -> None:
    assert unsupported_html_features(html) == expected


async def test_tool_rejects_parts_that_cannot_work_in_the_chat() -> None:
    html = '<p>Cost: <b id="v">calculating</b></p><button onclick="go()">Go</button>'

    result = await invoke("Cost", html)

    assert result["error_code"] == "visual_unsupported_html"
    assert result["data"]["features"] == ["button", "script"]
    assert ":checked" in result["data"]["next_step"]
