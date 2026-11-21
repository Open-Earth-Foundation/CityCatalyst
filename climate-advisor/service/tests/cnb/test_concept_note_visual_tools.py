"""Verify the CNB render-visual tool's validation and result envelope."""

import json

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.visual_html import (
    needs_svg,
    unsupported_html_features,
    smallest_svg_text_px,
    svg_animation_elements,
    waffle_cell_counts,
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
    mini = '<svg viewBox="0 0 150 100"><text font-size="13">a</text></svg>'

    assert (await invoke("Emissions", svg))["success"] is True
    assert (await invoke("Emissions", mini))["success"] is True


@pytest.mark.parametrize(
    "svg",
    [
        # 12 in a 340-wide viewBox draws at 11.3 px in the 320 px column.
        '<svg viewBox="0 0 340 200"><text font-size="12">a</text></svg>',
        # 12 in a mini chart draws at 11.2 px; mini charts need 13.
        '<svg viewBox="0 0 150 100"><text font-size="12">a</text></svg>',
    ],
)
async def test_tool_rejects_svg_text_just_under_12_px(svg: str) -> None:
    result = await invoke("Emissions", svg)

    assert result["error_code"] == "visual_text_too_small"
    assert "smaller than 12 px" in result["data"]["reason"]


MERMAID = "<pre class=\"mermaid\">flowchart TD\n  A[Baseline] --> B[Target]</pre>"


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        (MERMAID, True),
        ('<div class="language-mermaid">A --> B</div>', True),
        ("<pre><code>graph LR\nA-->B</code></pre>", True),
        # Prose paragraphs are never read as source.
        ("<p>sequenceDiagram\n Alice->>Bob: Hi</p>", False),
        ("<pre>pie title Sectors\n \"Energy\" : 412</pre>", True),
        ("<div>gantt\n dateFormat YYYY</div>", True),
        # A drawn SVG next to the source is fine.
        (MERMAID + '<svg viewBox="0 0 320 90"><rect width="9"/></svg>', False),
        # Prose that merely mentions a chart type is not Mermaid source.
        ("<p>Pie chart of sectors: energy 412 ktCO2e</p>", False),
        ("<p>graph of emissions by year</p><table><tr><td>1</td></tr></table>", False),
        ("<p>Gantt chart of phases</p>", False),
        ("<script>graph TD</script><p>42</p>", False),
        # A canvas is never drawn without scripts, even next to text or SVG.
        ('<p>Emissions 2019-2023</p><canvas id="c" height="160"></canvas>', True),
        ('<svg viewBox="0 0 320 90"><rect width="9"/></svg><canvas></canvas>', True),
    ],
)
def test_needs_svg(html: str, expected: bool) -> None:
    assert needs_svg(html) is expected


async def test_tool_rejects_mermaid_source_with_one_retry_hint() -> None:
    result = await invoke("Flow", MERMAID)

    assert result["success"] is False
    assert result["error_code"] == "visual_needs_svg"
    assert "inline SVG" in result["data"]["next_step"]
    assert "retry once" in result["data"]["next_step"]
    assert "answer in text" in result["data"]["next_step"]


async def test_tool_rejects_svg_animation_elements() -> None:
    svg = (
        '<svg viewBox="0 0 320 100"><rect width="0" height="20">'
        '<animate attributeName="width" to="200" dur="1s" fill="freeze"/>'
        '<animateTransform attributeName="transform" type="scale"/></rect>'
        '<set attributeName="opacity" to="1"/></svg>'
    )

    result = await invoke("Bars", svg)

    assert result["success"] is False
    assert result["error_code"] == "visual_uses_svg_animation"
    assert result["data"]["elements"] == ["animate", "animateTransform", "set"]
    assert "@keyframes" in result["data"]["next_step"]
    assert "retry once" in result["data"]["next_step"]


DATA_IMG = "data:image/svg+xml;base64,PHN2Zy8+,AA"


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        # Each part shows in the chat but does nothing there.
        ('<p id="v">calculating</p><script>v.textContent="125"</script>', ["script"]),
        ('<p onclick="go()">Buildings 455</p>', ["script"]),
        ('<button>Show 2024</button><p>2023: 455</p>', ["button"]),
        ('<input type="range" min="0" max="10"><output>0</output>', ["input type=range"]),
        ('<input placeholder="Search"><p>455</p>', ["input type=text"]),
        ('<style>.t:target{display:block}</style><p class="t" id="a">455</p>', [":target"]),
        ('<svg viewBox="0 0 320 40"><foreignObject><p>455</p></foreignObject></svg>', ["foreignObject"]),
        ('<p>Map</p><iframe src="https://example.org/map"></iframe>', ["embedded frame"]),
        ('<p>Photo</p><img src="https://example.org/a.jpg" alt="site">', ["external resource"]),
        ('<p>Photo</p><img src="a.jpg">', ["external resource"]),
        ('<style>@import url("https://fonts.example/x.css")</style><p>455</p>', ["external resource"]),
        ('<p style="background:url(//cdn.example/x.png)">455</p>', ["external resource"]),
        ('<link rel="stylesheet" href="x.css"><p>455</p>', ["external resource"]),
        ('<svg viewBox="0 0 9 9"><image href="https://e.org/i.png"/></svg>', ["svg image"]),
        # The sanitizer drops these, and the CSP has no media source.
        (f'<svg viewBox="0 0 9 9"><image href="{DATA_IMG}"/></svg>', ["svg image"]),
        ('<svg viewBox="0 0 9 9"><use href="#2025"/><use href="#a b"/></svg>', ["svg href"]),
        # A <use> naming no element draws nothing; a later definition is fine.
        ('<svg viewBox="0 0 9 9"><symbol id="tree-icon"/><use href="#tree"/></svg>', ["svg href"]),
        ('<svg viewBox="0 0 9 9"><use href="#t"/><defs><symbol id="t"/></defs></svg>', []),
        # The sanitizer drops ids that clash with document or form properties.
        ('<svg viewBox="0 0 9 9"><symbol id="location"/><use href="#location"/></svg>', ["svg href"]),
        ('<svg viewBox="0 0 9 9"><symbol id="cnb-location"/><use href="#cnb-location"/></svg>', []),
        ('<button popovertarget="title">Notes</button><div popover id="title">4</div>', ["button"]),
        # Values are matched trimmed, as the sanitizer trims them.
        ('<button popovertarget=" title ">Notes</button><div popover id=" title ">4</div>', ["button"]),
        ('<svg viewBox="0 0 9 9"><symbol id="cnb-b "/><use href=" #cnb-b"/></svg>', []),
        # An id resolves to its first element, which must be the popover.
        (
            '<h3 id="cnb-a">Assumptions</h3><button popovertarget="cnb-a">i</button>'
            '<div popover id="cnb-a">4</div>',
            ["button"],
        ),
        # image-set() loads its quoted URLs; type() strings are formats.
        (
            '<div style="background-image:image-set(\'https://e.org/m.png\' 1x)">Map</div>',
            ["external resource"],
        ),
        (
            f'<style>.m{{background:image-set("{DATA_IMG}" type("image/svg+xml"))}}</style><p class="m">4</p>',
            [],
        ),
        ('<svg viewBox="0 0 9 9"><rect href="#a"/></svg>', ["svg href"]),
        ('<svg viewBox="0 0 9 9"><use href="icons.svg#a"/></svg>', ["external resource"]),
        (f'<video src="{DATA_IMG}"></video><p>455</p>', ["video or audio"]),
        # A srcset candidate after a comma with no space, and url() in fill.
        (f'<img srcset="{DATA_IMG} 1x,https://e.org/x.png 2x">', ["external resource", "srcset"]),
        # Ids are ASCII only, as in the frontend's LOCAL_REFERENCE.
        ('<svg viewBox="0 0 9 9"><use href="#caf\u00e9"/><g id="caf\u00e9"/></svg>', ["svg href"]),
        ('<svg viewBox="0 0 9 9"><rect fill="url(https://e.org/p.svg#g)"/></svg>', ["external resource"]),
        # Native controls, popovers, local references and data: URLs work.
        ('<input type="radio" id="a" checked><label for="a">2023</label>', []),
        ('<input type="checkbox" id="s1"><select><option>2023</option></select>', []),
        ('<button popovertarget="p">Details</button><div popover id="p">455</div>', []),
        ('<button commandfor="d" command="show-modal">Open</button><dialog id="d">455</dialog>', []),
        ('<button commandfor="p" command="toggle-popover">i</button><div popover id="p">4</div>', []),
        # A button whose target is missing or that has no command does nothing.
        ('<button popovertarget="#m">Show</button><div popover id="m">455</div>', ["button"]),
        ('<button commandfor="d">Open</button><dialog id="d">455</dialog>', ["button"]),
        ('<button commandfor="d" command="show-modal">Open</button><div id="d">4</div>', ["button"]),
        (f'<img src="{DATA_IMG}" alt="ok">', []),
        # The sanitizer drops srcset, so a data: candidate shows nothing either.
        (f'<picture><source srcset="{DATA_IMG} 1x"><img alt="x"></picture>', ["srcset"]),
        (
            '<svg viewBox="0 0 320 40"><defs><linearGradient id="g"/></defs>'
            '<rect fill="url(#g)" width="9" height="9"/><use href="#g"/></svg>'
            "<style>/* :target */ .b{background:url('data:image/png;base64,AA')}</style>",
            [],
        ),
        ('<svg viewBox="0 0 320 40"><stop offset="0"/><text>455</text></svg>', []),
        # Attributes that only start like a handler, and CSS text in strings.
        ('<p one-line="true" only="1">455</p>', []),
        # url() and :target as text: an aria-label and a custom property value.
        ('<svg viewBox="0 0 9 9" aria-label="Source: url(report)"><rect/></svg>', []),
        ('<style>.a{--section:target}</style><p class="a">455</p>', []),
        ('<style>@media (min-width:1px){.t:target{color:red}}</style><p>4</p>', [":target"]),
        ('<style>@supports selector(:target){.l{color:green}}</style><p class="l">4</p>', []),
        # A px width over the phone column, unless CSS sizes the svg.
        ('<svg width="600" height="120"><text>455</text></svg>', ["svg width over 320 px"]),
        ('<svg width="600px" viewBox="0 0 600 120"><text>455</text></svg>', ["svg width over 320 px"]),
        ('<svg width="320" height="120" viewBox="0 0 320 120"></svg>', []),
        ('<svg width="100%" viewBox="0 0 640 120"></svg>', []),
        ('<svg width="600" height="300" style="width:200px;height:auto"></svg>', []),
        ('<svg width="600" height="300" style="width:100%;max-width:300px"></svg>', []),
        ('<style>@media (min-width:1px){.c svg{max-width:100%}}</style><svg width="600"></svg>', []),
        ('<style>svg:not(.icon){width:100%;height:auto}</style><svg width="480"></svg>', []),
        ('<style>*{max-width:100%}</style><svg width="480"></svg>', []),
        # CSS nesting: the parent's width counts before and after a nested rule.
        (
            '<style>svg.chart{width:100%;height:auto;& text{font-weight:600}}</style>'
            '<svg class="chart" width="640"></svg>',
            [],
        ),
        (
            '<style>svg{& text{font-weight:600} max-width:100%}</style><svg width="640"></svg>',
            [],
        ),
        ('<svg viewBox="0 0 320 90"><svg width="900" height="9"></svg></svg>', []),
        # A rule sizes the svg by class or id; one for other elements does not.
        (
            '<style>.chart{width:100%;max-width:320px;height:auto}</style>'
            '<svg class="chart wide" width="480" viewBox="0 0 480 200"></svg>',
            [],
        ),
        ('<style>#m{max-width:100%}</style><svg id="m" width="480"></svg>', []),
        ('<style>div svg.c{max-width:100%}</style><svg class="c" width="480"></svg>', []),
        ('<style>.card{max-width:320px}</style><svg width="480"></svg>', ["svg width over 320 px"]),
        ('<style>.chart{max-width:100%}</style><svg class="other" width="480"></svg>', ["svg width over 320 px"]),
        ('<style>.svg-note{max-width:100%}</style><svg width="480"></svg>', ["svg width over 320 px"]),
        ('<style>div{width:100%}</style><svg width="480"></svg>', ["svg width over 320 px"]),
        ('<style>.n::after{content:":target @import url(example)"}</style><p class="n">4</p>', []),
        ('<style>.n::after{content:"a"}/* @import url(x) */</style><p>455</p>', []),
        # Local references the sanitizer keeps, with either href spelling.
        (
            '<svg viewBox="0 0 9 9"><defs><symbol id="icon"/><path id="arc_1"/>'
            '<pattern id="p" href="#p0"/></defs><use xlink:href="#icon"/>'
            '<text><textPath href="#arc_1">Arc</textPath></text></svg>',
            [],
        ),
        # Links are removed but keep their text.
        ('<p><a href="https://example.org">Source: city report</a></p>', []),
        ('<style>@import "x.css";</style><p>455</p>', ["external resource"]),
    ],
)
def test_unsupported_html_features(html: str, expected: list[str]) -> None:
    assert unsupported_html_features(html) == expected


async def test_tool_rejects_parts_that_cannot_work_in_the_chat() -> None:
    html = (
        '<p>Cost per home: <b id="v">calculating</b></p>'
        '<button onclick="v.textContent=125">Compute</button>'
        "<script>v.textContent='EUR 125'</script>"
    )

    result = await invoke("Cost", html)

    assert result["success"] is False
    assert result["error_code"] == "visual_unsupported_html"
    assert result["data"]["features"] == ["button", "script"]
    assert ":checked" in result["data"]["next_step"]
    assert "retry once" in result["data"]["next_step"]
    assert "answer in text" in result["data"]["next_step"]


async def test_tool_accepts_css_keyframe_animation() -> None:
    html = (
        "<style>@keyframes grow{from{transform:scaleX(0)}}rect{animation:grow 1s}"
        '</style><svg viewBox="0 0 320 100"><rect width="200" height="20"/></svg>'
    )

    assert svg_animation_elements(html) == []
    assert (await invoke("Bars", html))["success"] is True


def _cells(count: int, tag: str = "span") -> str:
    return f"<{tag}></{tag}>" * count


def _rows(*sizes: int) -> str:
    return "".join(f'<div class="row">{_cells(size)}</div>' for size in sizes)


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        # c27: a flat grid with one cell too many.
        (f'<div class="waffle">{_cells(101)}</div>', [101]),
        (f'<div class="waffle">{_cells(100)}</div>', [100]),
        # Rows of cells, found through aria-label.
        (f'<div role="img" aria-label="Waffle chart">{_rows(*[10] * 10)}</div>', [100]),
        (f'<div class="waffle">{_rows(*[10] * 9, 11)}</div>', [101]),
        # An SVG waffle of rect cells; its title and text are not cells.
        (
            '<svg viewBox="0 0 320 320" class="waffle-chart"><title>Share</title>'
            + _cells(99, "rect").replace("></rect>", "/>")
            + "<text>37%</text></svg>",
            [99],
        ),
        # A card around the grid: the grid is measured, not the card's parts.
        (
            f'<div class="waffle-card"><h3>Share</h3><div class="grid">{_cells(100)}'
            '</div><div class="legend"><span>A</span><span>B</span></div></div>',
            [100],
        ),
        # Too few cells to be a grid the check understands.
        ('<div class="waffle"><h3>Share</h3><p>37 of 100</p></div>', []),
        # No waffle in the document, however many cells.
        (f'<div class="grid">{_cells(101)}</div>', []),
    ],
)
def test_waffle_cell_counts(html: str, expected: list[int]) -> None:
    assert waffle_cell_counts(html) == expected


async def test_tool_rejects_waffle_without_100_cells() -> None:
    html = f'<p>37 of 100 buildings</p><div class="waffle">{_cells(101)}</div>'

    result = await invoke("Certificates", html)

    assert result["success"] is False
    assert result["error_code"] == "visual_waffle_cell_count"
    assert result["data"]["cell_counts"] == [101]
    assert "10 row elements of 10 cells" in result["data"]["next_step"]
    assert "retry once" in result["data"]["next_step"]
    fixed = html.replace(_cells(101), _rows(*[10] * 10))
    assert (await invoke("Certificates", fixed))["success"] is True


def test_hidden_svg_text_is_not_judged_by_size() -> None:
    # A closed tooltip and <defs> text are not drawn where they stand.
    html = (
        "<style>.pt .tip{display:none}.pt:focus .tip{display:block}</style>"
        '<svg viewBox="0 0 320 120"><defs><text id="d" font-size="6">x</text></defs>'
        '<g class="pt" tabindex="0"><rect width="9" height="9"/>'
        '<g class="tip"><text font-size="9">Buildings 455</text></g></g>'
        '<text font-size="12" style="display:none">tiny</text>'
        '<text font-size="13">Buildings</text></svg>'
    )
    assert smallest_svg_text_px(html) == 13


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("<p>classDiagram is the Mermaid keyword for class charts.</p>", False),
        ("<pre>classDiagram\n  Animal <|-- Duck</pre>", True),
    ],
)
def test_needs_svg_reads_mermaid_only_in_code_blocks(html: str, expected: bool) -> None:
    assert needs_svg(html) is expected


def test_waffle_count_ignores_a_values_table_inside_the_waffle_card() -> None:
    cells = "".join(f"<i class={'y' if n < 37 else ''}></i>" for n in range(100))
    rows = "".join(f"<tr><td>{n}</td><td>{n}</td></tr>" for n in range(60))
    html = (
        f'<div class="waffle-card"><div class="grid">{cells}</div>'
        f"<table><tbody>{rows}</tbody></table></div>"
    )
    assert waffle_cell_counts(html) == [100]


def test_hidden_text_rules_follow_the_selector_and_any_style_position() -> None:
    svg = (
        '<svg viewBox="0 0 320 120"><g class="tooltip"><text class="label" font-size="5">a</text></g>'
        '<text class="label" font-size="5">b</text><text font-size="13">c</text></svg>'
    )
    # ".tooltip .label" hides only labels inside a tooltip: "b" still counts.
    assert smallest_svg_text_px("<style>.tooltip .label{display:none}</style>" + svg) == 5
    # A rule after the SVG still hides its target.
    hidden_tip = (
        '<svg viewBox="0 0 320 120"><g class="tip"><text font-size="5">a</text></g>'
        '<text font-size="13">c</text></svg><style>.tip{display:none}</style>'
    )
    assert smallest_svg_text_px(hidden_tip) == 13


def test_waffle_marked_table_without_a_grid_is_not_an_error() -> None:
    assert waffle_cell_counts('<table class="waffle"><caption>Readiness</caption></table>') == []
    assert waffle_cell_counts('<div class="waffle"><table><tr><td>1</td></tr></table></div>') == []


async def test_render_visual_accepts_a_waffle_marked_table() -> None:
    html = '<p>Readiness 37%</p><table class="waffle"><caption>Readiness</caption></table>'
    result = await invoke("Readiness", html)
    assert result["success"] is True
