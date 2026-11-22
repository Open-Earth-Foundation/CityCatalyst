/** @jest-environment jsdom */

import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  buildSandboxedVisualDocument,
  prepareVisualDocument,
} from "@/components/ConceptNoteWorkspace/chat-visual-frame";
import {
  applyExpandedLayout,
  syncHostTheme,
} from "@/components/ConceptNoteWorkspace/chat-visual-layout";

/** The sandboxed document as the iframe receives it, parsed for assertions. */
const render = (html: string) =>
  new DOMParser().parseFromString(
    buildSandboxedVisualDocument(html),
    "text/html",
  );

describe("visual layout: tables", () => {
  it("leaves documents without tables untouched", () => {
    expect(
      buildSandboxedVisualDocument("<svg><text>40 kt</text></svg>"),
    ).toContain("<body><svg><text>40 kt</text></svg></body>");
  });

  it("scrolls each top-level table inside its own box, rows and units kept", () => {
    const doc = render(
      '<table style="width:760px"><thead><tr><th>Source</th><th>District estimate (ktCO₂e)</th></tr></thead>' +
        "<tbody><tr><td>Auditor</td><td>12</td></tr><tr><td>City</td><td>18</td></tr></tbody></table>" +
        "<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>",
    );
    const [wide, outer, nested] = Array.from(doc.querySelectorAll("table"));
    expect(wide.parentElement!.className).toBe("cc-visual-table-scroll");
    expect(outer.parentElement!.className).toBe("cc-visual-table-scroll");
    expect(nested.parentElement!.tagName).toBe("TD");
    expect(wide.tHead!.textContent).toBe("SourceDistrict estimate (ktCO₂e)");
    expect(wide.tBodies[0].rows).toHaveLength(2);
    expect(doc.querySelector("style[data-cc-host]")!.textContent).toContain(
      ".cc-visual-table-scroll{overflow-x:auto!important",
    );
  });
});

describe("prepareVisualDocument", () => {
  it("parses the model HTML once and adapts the sanitized DOM", () => {
    const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
    const visual = prepareVisualDocument(
      `<table onclick="steal()"><tbody><tr><td>D01</td><td>1 ktCO₂e</td></tr></tbody></table><script>alert(1)</script>`,
    );
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();

    expect(visual.hasContent).toBe(true);
    expect(
      visual.srcDoc.startsWith(
        '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"',
      ),
    ).toBe(true);
    expect(visual.srcDoc).not.toMatch(/script|onclick/);
    expect(visual.srcDoc).toContain('<div class="cc-visual-table-scroll">');
    expect(visual.srcDoc).toContain("<td>D01</td><td>1 ktCO₂e</td>");
  });

  it("reports a blank document after sanitizing", () => {
    expect(prepareVisualDocument("<script>alert(1)</script>").hasContent).toBe(
      false,
    );
  });
});

describe("expanded layout", () => {
  // Restores the viewport and removes the host styles between tests.
  const originalSize = { width: window.innerWidth, height: window.innerHeight };
  const setViewport = (width: number, height = 900) => {
    window.innerWidth = width;
    window.innerHeight = height;
  };
  afterEach(() => {
    setViewport(originalSize.width, originalSize.height);
    document
      .querySelectorAll("style[data-cc-expanded]")
      .forEach((style) => style.remove());
    document.body.innerHTML = "";
  });

  // A chart, then a legend, at fixed viewport positions (jsdom has no layout).
  const rect = (top: number, height: number) =>
    ({ top, height, bottom: top + height }) as DOMRect;
  const layoutChart = (top: number, height: number, legendHeight: number) => {
    document.body.innerHTML =
      '<h1>Title</h1><svg viewBox="0 0 400 300"></svg><p>Legend</p>';
    const chart = document.querySelector("svg")!;
    chart.getBoundingClientRect = () => rect(top, height);
    document.querySelector("p")!.getBoundingClientRect = () =>
      rect(top + height, legendHeight);
    return chart;
  };

  it("zooms a 1200 px dialog by 1.6, caps the chart in unzoomed px, and keeps one style", () => {
    setViewport(1200, 900);
    applyExpandedLayout(document);
    applyExpandedLayout(document);
    const styles = document.querySelectorAll("style[data-cc-expanded]");
    expect(styles).toHaveLength(1);
    // (900 - 48) / 1.6 = 532.5, so the chart is capped at 532 unzoomed px.
    expect(styles[0].textContent).toBe(
      "html{zoom:1.6}body{max-width:560px!important;margin-left:auto!important;margin-right:auto!important}svg[viewBox]:not(svg svg){max-height:532px!important;max-width:100%!important}",
    );
  });

  it("keeps a phone-width dialog at zoom 1", () => {
    setViewport(344, 768);
    applyExpandedLayout(document);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).toContain("html{zoom:1}");
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).toContain("max-height:720px!important");
  });

  it("updates the zoom on window resize, with one listener per document", () => {
    setViewport(1200, 900);
    applyExpandedLayout(document);
    applyExpandedLayout(document);
    setViewport(344, 768);
    window.dispatchEvent(new Event("resize"));
    const style = document.querySelector("style[data-cc-expanded]")!;
    expect(document.querySelectorAll("style[data-cc-expanded]")).toHaveLength(
      1,
    );
    expect(style.textContent).toContain("html{zoom:1}");
  });

  it("caps the first chart so its legend fits on the first screen", () => {
    // Zoom 1 at 600 px. Room: 832 - 200 - (60 + 8) - 16 = 548 px.
    setViewport(600, 832);
    const chart = layoutChart(200, 700, 60);
    applyExpandedLayout(document);
    expect(chart.hasAttribute("data-cc-fit")).toBe(true);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).toContain("svg[viewBox][data-cc-fit]{max-height:548px!important}");
  });

  it("does not mark a first chart that already fits with its legend", () => {
    // Room is 648 px, more than the 300 px chart.
    setViewport(600, 832);
    const chart = layoutChart(100, 300, 60);
    applyExpandedLayout(document);
    expect(chart.hasAttribute("data-cc-fit")).toBe(false);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).not.toContain("data-cc-fit");
  });

  it("leaves a first chart that starts far down the page to the screen cap", () => {
    // Room is 248 px, under 40% of the 832 px window.
    setViewport(600, 832);
    const chart = layoutChart(500, 700, 60);
    applyExpandedLayout(document);
    expect(chart.hasAttribute("data-cc-fit")).toBe(false);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).not.toContain("data-cc-fit");
  });

  it("does not reserve a follower taller than a quarter of the window", () => {
    // The 300 px block is over 208 px, so only the 16 px margin is kept: 616 px.
    setViewport(600, 832);
    layoutChart(200, 700, 300);
    applyExpandedLayout(document);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).toContain("svg[viewBox][data-cc-fit]{max-height:616px!important}");
  });
});

describe("host styles", () => {
  it("puts the theme before the model's CSS and the host rules after it", () => {
    const doc = render(
      "<html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>",
    );
    const styles = Array.from(doc.head.querySelectorAll("style"));
    expect(styles[0].hasAttribute("data-cc-theme")).toBe(true);
    expect(styles[0].textContent).toContain("--chart-1:#2351DC");
    expect(styles[0].textContent).toContain("color-scheme:light");
    expect(styles[0].textContent).toContain(
      "body{margin:0;padding:12px;font-family:var(--font-sans)",
    );
    expect(styles[1].textContent).toBe("p{color:red}");
    expect(styles.at(-1)!.hasAttribute("data-cc-host")).toBe(true);
    expect(styles.at(-1)!.textContent).toContain(
      "svg:not(svg svg){overflow:visible}",
    );
  });

  it("resolves the model's colour-scheme media rules to light", () => {
    const doc = render(
      "<style>@media (prefers-color-scheme: dark){body{background:#111}}@media (prefers-color-scheme:light) and (min-width:400px){p{color:red}}</style><p>Hi</p>",
    );
    const css = Array.from(
      doc.querySelectorAll("style"),
      (s) => s.textContent,
    ).join("");
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).toContain("@media (width < 0px){body{background:#111}}");
    expect(css).toContain("@media (width >= 0px) and (min-width:400px)");
  });

  it("copies the organization theme colours from the app into a loaded frame", () => {
    // In the app the variables come from the theme on an ancestor; jsdom
    // resolves only the element's own, so they are set on the frame here.
    const wrapper = document.createElement("div");
    const frame = document.createElement("iframe");
    frame.style.setProperty("--chakra-colors-interactive-secondary", "#8E7109");
    frame.style.setProperty(
      "--chakra-colors-content-primary",
      "red;}body{display:none",
    );
    wrapper.append(frame);
    document.body.append(wrapper);
    try {
      const frameDoc = frame.contentDocument!;
      frameDoc.open();
      frameDoc.write(
        buildSandboxedVisualDocument("<p>Hi</p>").replace(
          /<meta http-equiv[^>]*>/,
          "",
        ),
      );
      frameDoc.close();
      syncHostTheme(frame);
      const theme = frameDoc.querySelector("style[data-cc-theme]")!;
      expect(theme.textContent).toContain("--chart-1:#8E7109");
      // Anything but a plain colour keeps the default.
      expect(theme.textContent).toContain("--foreground:#00001F");
      expect(theme.textContent).not.toContain("display:none");
    } finally {
      wrapper.remove();
    }
  });
});

describe("expanded layout: whole-page fit and chart text", () => {
  const originalSize = { width: window.innerWidth, height: window.innerHeight };
  afterEach(() => {
    window.innerWidth = originalSize.width;
    window.innerHeight = originalSize.height;
    document
      .querySelectorAll("style[data-cc-expanded]")
      .forEach((style) => style.remove());
    document.body.innerHTML = "";
  });
  const box = (top: number, width: number, height: number) =>
    ({
      top,
      width,
      height,
      bottom: top + height,
      left: 0,
      right: width,
    }) as DOMRect;

  it("zooms a page that fits at 1x only as far as it still fits whole", () => {
    window.innerWidth = 1200;
    window.innerHeight = 900;
    document.body.innerHTML = "<ol><li>Abbey 120</li></ol>";
    // 700 px of content and jsdom's 8 px body margin: (900 - 16) / 708 = 1.248,
    // under the width zoom 1.6.
    document.querySelector("ol")!.getBoundingClientRect = () =>
      box(0, 560, 700);
    applyExpandedLayout(document);
    const css = document.querySelector("style[data-cc-expanded]")!.textContent;
    expect(css).toContain("html{zoom:1.248}");
    expect(css).not.toContain("data-cc-fit");
  });

  it("keeps the width zoom for a page taller than the frame", () => {
    window.innerWidth = 1200;
    window.innerHeight = 900;
    document.body.innerHTML = "<ol><li>Abbey 120</li></ol>";
    document.querySelector("ol")!.getBoundingClientRect = () =>
      box(0, 560, 1400);
    applyExpandedLayout(document);
    expect(
      document.querySelector("style[data-cc-expanded]")!.textContent,
    ).toContain("html{zoom:1.6}");
  });

  it("narrows a chart whose labels would outgrow the page text", () => {
    window.innerWidth = 1200;
    window.innerHeight = 900;
    document.body.innerHTML =
      '<div><svg viewBox="0 0 150 120"><text style="font-size:13px">Waste</text><text style="font-size:13px">2019</text></svg></div><p style="font-size:12px">Source</p><div><svg viewBox="0 0 320 200"><text style="font-size:12px">Ok</text></svg></div>';
    const [mini, wide] = Array.from(document.querySelectorAll("svg"));
    // The mini chart fills a 270 px cell: 13 units draw at 23.4 px, over 1.5 x 12.
    mini.getBoundingClientRect = () => box(0, 270, 216);
    mini.parentElement!.getBoundingClientRect = () => box(0, 270, 216);
    // 12 units in 320 drawn 400 wide is 15 px, under the 18 px limit.
    wide.getBoundingClientRect = () => box(300, 400, 250);
    applyExpandedLayout(document);
    const css = document.querySelector("style[data-cc-expanded]")!.textContent;
    expect(mini.getAttribute("data-cc-text-cap")).toBe("0");
    // 150 x 18 / 13 = 207 px wide, centred in its cell.
    expect(css).toContain(
      'svg[viewBox][data-cc-text-cap="0"]:not(svg svg){max-width:207px!important;display:block!important',
    );
    expect(wide.hasAttribute("data-cc-text-cap")).toBe(false);
  });
});
