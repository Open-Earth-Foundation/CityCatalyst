"""Verify the CNB render-visual tool's validation and result envelope."""

import json

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_visual_tools import concept_note_render_visual
from app.utils.visual_html import (
    needs_svg,
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
