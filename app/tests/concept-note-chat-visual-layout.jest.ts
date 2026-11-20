/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  buildSandboxedVisualDocument,
  prepareVisualDocument,
} from "@/components/ConceptNoteWorkspace/chat-visual-frame";
import {
  applyExpandedLayout,
  ensureContentInset,
  syncHostTheme,
  watchTableScroll,
} from "@/components/ConceptNoteWorkspace/chat-visual-layout";

// German labels, so the tests also show the toggle is not hard-coded English.
const labels = {
  showAll: (count: number) => `Alle ${count} Einträge anzeigen`,
  showFirst: (count: number) => `Nur die ersten ${count} Einträge anzeigen`,
  scrollHint: "Seitlich scrollen, um alle Spalten zu sehen →",
};
// The layout style, not the host's theme and overflow styles.
const LAYOUT_STYLE = "head style[data-cc-layout]";

/** The sandboxed document as the iframe receives it, parsed for assertions. */
const render = (html: string) =>
  new DOMParser().parseFromString(
    buildSandboxedVisualDocument(html, labels),
    "text/html",
  );
const collapsed = (html: string) =>
  render(html).querySelector(".cc-visual-long") !== null;

const pad = (n: number) => String(n).padStart(2, "0");
// 60 synthetic districts, highest first, each with an exact value and unit.
const ranking = Array.from(
  { length: 60 },
  (_, i) => `<tr><td>D${pad(60 - i)}</td><td>${60 - i} ktCO₂e</td></tr>`,
).join("");
const header = "<thead><tr><th>District</th><th>Total</th></tr></thead>";

// 24 monthly observations (synthetic), in calendar order, values go up and down.
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const monthlyValues = [
  41, 38, 36, 30, 27, 25, 29, 31, 28, 33, 37, 42, 40, 37, 34, 29, 26, 24, 27,
  30, 27, 31, 35, 39,
];
const monthlyRows = monthlyValues
  .map(
    (value, i) =>
      `<tr><td>${MONTHS[i % 12]} ${2023 + Math.floor(i / 12)}</td><td>${value} ktCO₂e</td></tr>`,
  )
  .join("");

// A real procedure: 24 numbered steps, several mentioning years or counts.
const steps = Array.from(
  { length: 24 },
  (_, i) =>
    `<li>Step ${i + 1}: ${i % 3 === 0 ? "Check the 2023 inventory for sector " + (i + 1) : "Confirm owner sign-off"}</li>`,
).join("");

describe("visual layout: tables", () => {
  it("leaves documents without tables or lists untouched", () => {
    expect(
      buildSandboxedVisualDocument("<svg><text>40 kt</text></svg>"),
    ).toContain("<body><svg><text>40 kt</text></svg></body>");
  });

  it("scrolls a wide table inside its own box without collapsing rows", () => {
    const doc = render(
      '<table style="width:760px"><thead><tr><th>Source</th><th>District estimate (ktCO₂e)</th></tr></thead>' +
        "<tbody><tr><td>Auditor</td><td>12</td></tr><tr><td>City</td><td>18</td></tr></tbody></table>",
    );
    const table = doc.querySelector("table")!;
    expect(table.parentElement!.className).toBe("cc-visual-table-scroll");
    expect(doc.querySelector(LAYOUT_STYLE)!.textContent).toContain(
      ".cc-visual-table-scroll{overflow-x:auto!important",
    );
    // Ordinary short table: no toggle, header and unit kept.
    expect(doc.querySelector("details")).toBeNull();
    expect(table.tHead!.textContent).toBe("SourceDistrict estimate (ktCO₂e)");
    // The hint sits right after the scroll box, with the label text.
    const hint = table.parentElement!.nextElementSibling!;
    expect(hint.className).toBe("cc-visual-scroll-hint");
    expect(hint.textContent).toBe(labels.scrollHint);
  });

  it("keeps a table the model already scrolls in its scroller, not wrapped twice", () => {
    // The wrapper the prompt asks for, and the class-based one a real model reply used.
    for (const html of [
      '<div style="overflow-x:auto"><table><tr><td>North</td><td>98</td></tr></table></div>',
      "<style>.scroll{overflow-x:auto}</style><div class=scroll><table><tr><td>North</td><td>98</td></tr></table></div>",
      "<style>@media (max-width:600px){.wrap{overflow:auto}}</style><div class=wrap><table><tr><td>North</td><td>98</td></tr></table></div>",
    ]) {
      const doc = render(html);
      // The model's scroller is the one scroll box, followed by one hint.
      const box = doc.querySelector(".cc-visual-table-scroll")!;
      expect(doc.querySelectorAll(".cc-visual-table-scroll")).toHaveLength(1);
      expect(doc.querySelector("table")!.parentElement).toBe(box);
      expect(box.nextElementSibling!.className).toBe("cc-visual-scroll-hint");
      expect(doc.querySelectorAll("div")).toHaveLength(1);
    }
  });

  it("collapses a captioned 60-row ranking, every exact value kept in order", () => {
    const doc = render(
      `<table><caption>Districts ranked by total emissions</caption>${header}<tbody>${ranking}</tbody></table>`,
    );
    const block = doc.querySelector(".cc-visual-long")!;
    expect(block.children[0].className).toBe("cc-visual-table-scroll");
    const toggle = block.querySelector(
      ":scope > details.cc-visual-long-toggle",
    )!;
    expect(toggle.hasAttribute("open")).toBe(false);
    expect(toggle.querySelector(".cc-more")!.textContent).toBe(
      "Alle 60 Einträge anzeigen",
    );
    expect(toggle.querySelector(".cc-less")!.textContent).toBe(
      "Nur die ersten 10 Einträge anzeigen",
    );
    const rows = Array.from(
      doc.querySelectorAll("tbody tr"),
      (r) => r.textContent,
    );
    expect(rows).toHaveLength(60);
    expect(rows[0]).toBe("D6060 ktCO₂e");
    expect(rows[59]).toBe("D011 ktCO₂e");
    expect(doc.querySelector(LAYOUT_STYLE)!.textContent).toContain(
      "table.cc-visual-ranked>tbody>tr:nth-child(n+11)",
    );
  });

  it("collapses a table with a Rank column numbered from 1, even without a label", () => {
    const rows = Array.from(
      { length: 30 },
      (_, i) =>
        `<tr><td>${i + 1}</td><td>D${pad(30 - i)}</td><td>${(30 - i) * 2} kt</td></tr>`,
    ).join("");
    const doc = render(
      `<table><thead><tr><th>Rank</th><th>District</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
    expect(doc.querySelector(".cc-more")!.textContent).toBe(
      "Alle 30 Einträge anzeigen",
    );
  });

  it("takes the ranking label from the heading above the model's own scroller", () => {
    const doc = render(
      `<h2>Top 60 districts by total</h2><div style="overflow-x:auto"><table>${header}<tbody>${ranking}</tbody></table></div>`,
    );
    // The model's scroller is reused as the collapsing block and marked as a scroll box.
    const block = doc.querySelector(".cc-visual-long")!;
    expect(block.firstElementChild!.getAttribute("style")).toBe(
      "overflow-x:auto",
    );
    expect(
      block.firstElementChild!.classList.contains("cc-visual-table-scroll"),
    ).toBe(true);
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(60);
  });

  it("promotes a body header row so it is neither hidden nor counted", () => {
    const doc = render(
      `<p>Districts, largest first</p><table><tr><th>District</th><th>Total</th></tr>${ranking}</table>`,
    );
    expect(doc.querySelector("thead")!.textContent).toBe("DistrictTotal");
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(60);
    expect(doc.querySelector(".cc-more")!.textContent).toBe(
      "Alle 60 Einträge anzeigen",
    );
  });

  it("keeps 24 chronological monthly observations fully visible", () => {
    const table = `<table><caption>Monthly emissions 2023–2024</caption><thead><tr><th>Month</th><th>Emissions</th></tr></thead><tbody>${monthlyRows}</tbody></table>`;
    expect(collapsed(table)).toBe(false);
    // Prose mentioning a highest value is not a ranking label.
    expect(collapsed(`<p>July 2024 had the highest value.</p>${table}`)).toBe(
      false,
    );
    // A cumulative series is in order, but nothing says it is a ranking.
    let total = 0;
    const cumulative = monthlyValues
      .map(
        (v, i) =>
          `<tr><td>${MONTHS[i % 12]} ${2023 + Math.floor(i / 12)}</td><td>${(total += v)} ktCO₂e</td></tr>`,
      )
      .join("");
    expect(
      collapsed(
        `<h3>Cumulative emissions</h3><table><tbody>${cumulative}</tbody></table>`,
      ),
    ).toBe(false);
    expect(render(table).querySelectorAll("tbody tr")).toHaveLength(24);
  });

  it("keeps long tables without a clear ranking marker fully visible", () => {
    // Highest first, but nothing says it is a ranking: unclear, so all shown.
    expect(collapsed(`<table>${header}<tbody>${ranking}</tbody></table>`)).toBe(
      false,
    );
    // Labelled as a ranking, but no column is in ranked order.
    const shuffled = Array.from(
      { length: 30 },
      (_, i) =>
        `<tr><td>Site ${(i * 7) % 30}</td><td>${(i * 13) % 30} kt</td></tr>`,
    ).join("");
    expect(
      collapsed(
        `<h3>Ranking of sites</h3><table><tbody>${shuffled}</tbody></table>`,
      ),
    ).toBe(false);
    // Merged cells.
    const merged = ranking.replace("<td>D60</td>", '<td rowspan="2">D60</td>');
    expect(
      collapsed(`<table><caption>Ranked districts</caption>${merged}</table>`),
    ).toBe(false);
    // The model's own disclosure already holds the full list.
    expect(
      collapsed(
        `<details><summary>Top 60 districts</summary><table><tbody>${ranking}</tbody></table></details>`,
      ),
    ).toBe(false);
  });
});

describe("visual layout: lists", () => {
  const items = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `<li>D${pad(n - i)} · ${n - i} ktCO₂e</li>`,
    ).join("");

  it("collapses a labelled long ranked list", () => {
    const doc = render(
      `<h3>Districts ranked by total</h3><ol>${items(30)}</ol>`,
    );
    expect(
      doc.querySelector(".cc-visual-long > ol.cc-visual-ranked")!.children,
    ).toHaveLength(30);
    expect(doc.querySelector(".cc-more")!.textContent).toBe(
      "Alle 30 Einträge anzeigen",
    );
    // An unordered list needs its values in ranked order too.
    expect(collapsed(`<p>Top 30 districts</p><ul>${items(30)}</ul>`)).toBe(
      true,
    );
  });

  it("keeps numbered steps and other unclear lists fully visible", () => {
    expect(
      collapsed(
        `<h3>How to prepare the inventory submission</h3><ol>${steps}</ol>`,
      ),
    ).toBe(false);
    for (const html of [
      `<ol>${items(30)}</ol>`, // no ranking label
      `<p>Top 20 districts</p><ol>${items(20)}</ol>`, // at the threshold
      `<p>Top 30 districts</p><ol reversed>${items(30)}</ol>`, // numbering would shift
      `<p>Districts ranked</p><ul>${Array.from({ length: 30 }, (_, i) => `<li>Site ${(i * 7) % 30}</li>`).join("")}</ul>`,
    ]) {
      expect(collapsed(html)).toBe(false);
    }
  });
});

describe("prepareVisualDocument", () => {
  it("parses the model HTML once and adapts the sanitized DOM", () => {
    const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
    const visual = prepareVisualDocument(
      `<p>Top 60 districts</p><table onclick="steal()"><tbody>${ranking}</tbody></table><script>alert(1)</script>`,
      labels,
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
    expect(visual.srcDoc).toContain(
      '<details class="cc-visual-long-toggle"><summary>',
    );
    expect(visual.srcDoc).toContain("<td>D01</td><td>1 ktCO₂e</td>");
  });

  it("reports a blank document after sanitizing", () => {
    expect(prepareVisualDocument("<script>alert(1)</script>").hasContent).toBe(
      false,
    );
  });
});

describe("expanded layout and table scroll cues", () => {
  // Restores the viewport and removes the host styles between tests.
  const originalSize = { width: window.innerWidth, height: window.innerHeight };
  const setViewport = (width: number, height = 900) => {
    window.innerWidth = width;
    window.innerHeight = height;
  };
  afterEach(() => {
    setViewport(originalSize.width, originalSize.height);
    document
      .querySelectorAll("style[data-cc-expanded], style[data-cc-inset]")
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

  it("marks the hidden side of an overflowing table once, and updates on scroll", () => {
    const observed: unknown[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor() {
        observed.push(this);
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const doc = render(
        '<table style="width:760px"><tbody><tr><td>1</td></tr></tbody></table>',
      );
      const box = doc.querySelector<HTMLElement>(".cc-visual-table-scroll")!;
      // jsdom has no layout: a 760 px table in a 400 px box, scrolled to the start.
      Object.defineProperties(box, {
        scrollWidth: { value: 760 },
        clientWidth: { value: 400 },
        scrollLeft: { value: 0, writable: true },
      });

      watchTableScroll(doc);
      watchTableScroll(doc);
      expect(observed).toHaveLength(1);
      expect(box.classList.contains("cc-overflow")).toBe(true);
      expect(box.classList.contains("cc-more-right")).toBe(true);
      expect(box.classList.contains("cc-more-left")).toBe(false);

      // Scrolled to the end: the fade moves to the left side.
      box.scrollLeft = 360;
      box.dispatchEvent(new Event("scroll"));
      expect(box.classList.contains("cc-more-left")).toBe(true);
      expect(box.classList.contains("cc-more-right")).toBe(false);
    } finally {
      globalThis.ResizeObserver = original;
    }
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

describe("default content inset", () => {
  // jsdom has no layout, so the frame width and text boxes are stubbed.
  const box = (left: number, top: number, width: number, height: number) =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  // Every text node gets this box, as if a single line of text sat there.
  const setTextBox = (rect: DOMRect) =>
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => rect,
    });

  beforeEach(() => {
    jest
      .spyOn(document.documentElement, "getBoundingClientRect")
      .mockReturnValue(box(0, 0, 1000, 800));
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1000,
    });
    document.body.innerHTML = "<p>Title</p>";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    document
      .querySelectorAll("style[data-cc-inset]")
      .forEach((style) => style.remove());
  });

  it("adds the side inset when text starts at the card edge", () => {
    setTextBox(box(0, 20, 100, 20));
    ensureContentInset(document);
    expect(document.querySelector("style[data-cc-inset]")!.textContent).toBe(
      "body{padding-left:12px!important;padding-right:12px!important}",
    );
  });

  it("adds nothing when content starts at 16, and measures a document only once", () => {
    setTextBox(box(16, 20, 100, 20));
    ensureContentInset(document);
    ensureContentInset(document);
    const styles = document.querySelectorAll("style[data-cc-inset]");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe("");
  });

  it("adds the top inset when text touches the top edge", () => {
    setTextBox(box(16, 0, 100, 20));
    ensureContentInset(document);
    expect(document.querySelector("style[data-cc-inset]")!.textContent).toBe(
      "body{padding-top:12px!important;padding-bottom:12px!important}",
    );
  });

  it("leaves a frame that is not laid out unmarked, so a later load measures it", () => {
    jest
      .spyOn(document.documentElement, "getBoundingClientRect")
      .mockReturnValue(box(0, 0, 0, 0));
    setTextBox(box(0, 20, 100, 20));
    ensureContentInset(document);
    expect(document.querySelector("style[data-cc-inset]")).toBeNull();
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
      "body{font-family:var(--font-sans)",
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

  it("hides an opening heading that repeats the card title", () => {
    const doc = new DOMParser().parseFromString(
      buildSandboxedVisualDocument(
        "<h1>Emissions by sector, 2024.</h1><p>Buildings lead.</p><h2>Emissions by sector, 2024</h2>",
        labels,
        "Emissions  by Sector, 2024",
      ),
      "text/html",
    );
    const [h1, h2] = Array.from(doc.querySelectorAll("h1,h2"));
    expect(h1.hasAttribute("data-cc-duplicate-title")).toBe(true);
    // Only the opening heading: later headings are content.
    expect(h2.hasAttribute("data-cc-duplicate-title")).toBe(false);
  });

  it("keeps a heading that is the page's only content", () => {
    const doc = new DOMParser().parseFromString(
      buildSandboxedVisualDocument("<h2>Energy mix</h2>", labels, "Energy mix"),
      "text/html",
    );
    expect(doc.querySelector("[data-cc-duplicate-title]")).toBeNull();
  });

  it("keeps the heading when only an empty SVG would remain", () => {
    const doc = new DOMParser().parseFromString(
      buildSandboxedVisualDocument(
        '<h2>Energy mix</h2><svg viewBox="0 0 10 10"></svg>',
        labels,
        "Energy mix",
      ),
      "text/html",
    );
    expect(doc.querySelector("[data-cc-duplicate-title]")).toBeNull();
  });

  it("matches a panel heading against the card title and the tab label", () => {
    const hidden = (body: string) =>
      new DOMParser()
        .parseFromString(
          buildSandboxedVisualDocument(body, labels, [
            "Retrofit plan",
            "Costs",
          ]),
          "text/html",
        )
        .querySelector("[data-cc-duplicate-title]")?.textContent;
    expect(hidden("<h3>Costs</h3><p>EUR 125</p>")).toBe("Costs");
    expect(hidden("<h3>Retrofit plan</h3><p>EUR 125</p>")).toBe(
      "Retrofit plan",
    );
    expect(
      hidden("<h3>Retrofit plan: Costs</h3><p>EUR 125</p>"),
    ).toBeUndefined();
  });

  it("keeps a heading that differs from the title or follows other text", () => {
    const html = (body: string) =>
      new DOMParser().parseFromString(
        buildSandboxedVisualDocument(body, labels, "Energy mix"),
        "text/html",
      );
    expect(
      html("<h1>Energy mix by source</h1>").querySelector(
        "[data-cc-duplicate-title]",
      ),
    ).toBeNull();
    expect(
      html("<p>Key result</p><h2>Energy mix</h2>").querySelector(
        "[data-cc-duplicate-title]",
      ),
    ).toBeNull();
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
        buildSandboxedVisualDocument("<p>Hi</p>", labels).replace(
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

describe("sticky table headers", () => {
  it("lets a table that fits its box stop scrolling, so a sticky header sticks to the page", () => {
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const doc = render(
        "<style>th{position:sticky;top:0}</style><table><thead><tr><th>Month</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
      );
      const scrollBox = doc.querySelector<HTMLElement>(
        ".cc-visual-table-scroll",
      )!;
      Object.defineProperties(scrollBox, {
        scrollWidth: { value: 300 },
        clientWidth: { value: 400 },
      });
      watchTableScroll(doc);
      expect(scrollBox.classList.contains("cc-fits")).toBe(true);
      expect(doc.querySelector(LAYOUT_STYLE)!.textContent).toContain(
        ".cc-visual-table-scroll.cc-fits{overflow:visible!important}",
      );
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
