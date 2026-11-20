/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { buildSandboxedVisualDocument, ChatVisualFrame } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-frame");
const { hasVisualContent, hasRenderedVisualContent } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-content");

// Same cases as climate-advisor/service/tests/cnb/test_concept_note_visual_empty.py
// where the sanitizer, not only the backend, makes them blank.
const BLANK = [
  "<!doctype html><html><body><script>document.body.innerHTML='<h1>42</h1>'</script></body></html>",
  '<div id="chart" style="height:300px"></div><script src="https://cdn.test/chart.js"></script>',
  "<html><head><title>Emissions</title><style>body{color:red}</style></head><body>\n &nbsp; <!-- 42 --></body></html>",
  '<iframe srcdoc="<p>42</p>"></iframe>',
  "<template><p>42</p></template>",
  '<img src="https://cdn.test/chart.png" alt="">',
  "<svg></svg>",
  '<svg viewBox="0 0 10 10"><title>Chart</title><image href="https://cdn.test/a.png"/></svg>',
  "<svg><foreignObject><p>42 tCO2e</p></foreignObject></svg>",
];
const VISIBLE = [
  "<table><tr><td>1</td></tr></table>",
  '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
  '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg>',
  "<svg><text>Label</text></svg>",
  '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Chart">',
  '<a href="https://evil.test">Source: City inventory 2023</a>',
  "<details><summary>Design</summary>Phase 1</details>",
  "<label><input type=radio name=t checked></label>",
  "<p>42 tCO2e</p><script>alert(1)</script>",
];

describe("hasVisualContent", () => {
  it.each(BLANK)("is blank after sanitizing: %s", (html) => {
    expect(hasVisualContent(buildSandboxedVisualDocument(html))).toBe(false);
  });

  it.each(VISIBLE)("keeps legitimate content: %s", (html) => {
    expect(hasVisualContent(buildSandboxedVisualDocument(html))).toBe(true);
  });
});

describe("hasRenderedVisualContent", () => {
  it("is unknown without layout", () => {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = "<p>42</p>";
    expect(hasRenderedVisualContent(doc)).toBeNull();
  });
});

describe("ChatVisualFrame blank visuals", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  const render = (html: string) =>
    act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualFrame lng="en" title="Emissions" html={html} />
        </ChakraProvider>,
      ),
    );
  const expandButton = () =>
    container.querySelector<HTMLButtonElement>("button[aria-label]");

  it("shows a note and hides Expand for a script-only visual", async () => {
    await render(BLANK[0]);

    expect(container.querySelector("iframe")).toBeNull();
    const note = container.querySelector(
      '[data-testid="concept-note-chat-visual-empty"]',
    );
    expect(note?.textContent).toBe("chat-visual-empty");
    // The title stays so the reader knows which visual failed.
    expect(container.textContent).toContain("Emissions");
    expect(expandButton()?.hidden).toBe(true);
  });

  it("keeps an SVG chart with no HTML text", async () => {
    await render(VISIBLE[1]);

    expect(container.querySelector("iframe")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="concept-note-chat-visual-empty"]'),
    ).toBeNull();
    expect(expandButton()?.hidden).toBe(false);
  });
});
