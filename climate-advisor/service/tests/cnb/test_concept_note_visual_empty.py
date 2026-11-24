"""Verify the static check for HTML that would render as a blank card."""

import pytest
from app.utils.visual_html import has_visible_content

# Content the chat sanitizer drops or never draws.
BLANK = [
    "<script>document.body.innerHTML='<h1>42</h1>'</script>",
    "<title>Emissions</title><style>body{color:red}</style> &nbsp; <!-- 42 -->",
    '<iframe srcdoc="<p>42</p>"></iframe><noscript>Enable JS</noscript>',
    "<template><p>42</p></template>",
    "<svg><foreignObject><p>42 tCO2e</p></foreignObject></svg>",
    "<canvas>Your browser does not support canvas</canvas>",
    '<img src="https://cdn.test/chart.png" alt="">',
    '<svg><title>Chart</title><image href="https://cdn.test/a.png"/></svg>',
    '<svg><use href="https://cdn.test/icons.svg#i"/></svg>',
    # A library chart: the canvas is never drawn, only its title shows.
    '<h2>Emissions by sector</h2><canvas id="c"></canvas>',
    # A selector is not a content value; empty content and transparent boxes
    # draw nothing.
    '<style>.content:hover{color:red}.a::after{content:""}</style><div class="content"></div>',
    '<div style="background:transparent;width:40px;height:10px"></div>',
]
# Legitimate static visuals, including ones with no HTML text at all.
VISIBLE = [
    '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
    '<svg><defs><symbol id="p"><circle r="2"/></symbol></defs><use xlink:href="#p"/></svg>',
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Chart">',
    '<a href="https://evil.test">Source: City inventory 2023</a>',
    "<label><input type=radio name=t checked></label>",
    # CSS-only bars: a value in ::after, or an inline-painted box.
    '<style>.bar::after{content:"412 ktCO2e"}</style><div class="bar"></div>',
    '<div style="background:#087f8c;width:60%;height:12px"></div>',
    # A heading alone is content when no canvas is waiting to be drawn.
    "<h1>37%</h1>",
]


@pytest.mark.parametrize("html", BLANK)
def test_blank_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is False


@pytest.mark.parametrize("html", VISIBLE)
def test_visible_after_sanitizing(html: str) -> None:
    assert has_visible_content(html) is True
