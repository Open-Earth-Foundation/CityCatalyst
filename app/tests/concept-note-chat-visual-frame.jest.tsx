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
import i18next from "i18next";
import { appTheme } from "@/lib/theme/recipes/app-theme";

// Real i18next (default escapeValue: true) so label escaping is exercised.
const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  resources: {
    en: {
      translation: { "chat-visual-expand-label": "Expand visual: {{title}}" },
    },
  },
});
const t = i18n.t.bind(i18n);
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

const { buildSandboxedVisualDocument, ChatVisualFrame } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-frame");

describe("buildSandboxedVisualDocument", () => {
  it("puts the CSP first and strips anything that can run, load or navigate", () => {
    const doc = buildSandboxedVisualDocument(
      [
        '<!DOCTYPE html><html lang="en"><head>',
        '<meta http-equiv="refresh" content="0;url=https://evil.test/r">',
        '<link rel="dns-prefetch" href="//evil.test"><base href="https://evil.test/">',
        "<style>td{color:red}</style></head><body>",
        "<script>location.href='https://evil.test/s'</script>",
        '<a href="https://evil.test/a" ping="https://evil.test/p">Source</a>',
        '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"></linearGradient></defs>',
        '<rect fill="url(#g)" width="5" height="5"></rect>',
        '<a href="https://evil.test/svg"><set attributeName="href" to="https://evil.test/set"></set>',
        '<text>Label</text></a><image href="https://evil.test/i.png"></image></svg>',
        '<form action="https://evil.test/f"><button>Send</button></form>',
        '<iframe src="https://evil.test/frame"></iframe>',
        '<table><tr><td onclick="steal()">1</td></tr></table></body></html>',
      ].join(""),
    );

    expect(doc).not.toContain("evil.test");
    expect(doc).not.toMatch(/<(script|a|form|iframe|link|base|set)\b/i);
    expect(doc).not.toContain("onclick");
    expect(doc.match(/<!doctype/gi)).toHaveLength(1);
    expect(
      doc.startsWith(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"',
      ),
    ).toBe(true);
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("script-src");
    // A legitimate static chart survives.
    expect(doc).toContain("<style>td{color:red}</style>");
    expect(doc).toContain('fill="url(#g)"');
    expect(doc).toContain("<text>Label</text>");
    expect(doc).toContain("Source");
    expect(doc).toContain("<td>1</td>");
  });

  it("wraps a fragment in a full document", () => {
    const doc = buildSandboxedVisualDocument("<svg></svg>");

    expect(doc).toMatch(
      /^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"[^>]*><\/head><body><svg><\/svg><\/body><\/html>$/,
    );
  });
});

describe("ChatVisualFrame", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    // jsdom has no layout; the frame re-measures on load in these tests.
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders the sanitized visual in a script-free sandbox", async () => {
    const title = "Emissions (tCO2e/yr) & targets";
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualFrame
            lng="en"
            title={title}
            html="<svg></svg><script>alert(1)</script>"
          />
        </ChakraProvider>,
      ),
    );

    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame.getAttribute("title")).toBe(title);
    expect(frame.getAttribute("srcdoc")).toContain("<svg></svg>");
    expect(frame.getAttribute("srcdoc")).not.toContain("script");
    expect(container.textContent).toContain("chat-visual-label");
    // The accessible name must carry the raw title, not HTML entities.
    const labels = Array.from(container.querySelectorAll("[aria-label]")).map(
      (element) => element.getAttribute("aria-label"),
    );
    expect(labels).toContain(`Expand visual: ${title}`);
  });

  it("fits the inline frame to its loaded content", async () => {
    document.body.appendChild(container);
    const onHeightChange = jest.fn();
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualFrame
            lng="en"
            title="Chart"
            html="<svg></svg>"
            onHeightChange={onHeightChange}
          />
        </ChakraProvider>,
      ),
    );
    const frame = container.querySelector("iframe")!;
    const load = (contentHeight: number) =>
      act(async () => {
        const doc = frame.contentDocument!;
        doc.documentElement.getBoundingClientRect = () =>
          ({ height: contentHeight }) as DOMRect;
        Object.defineProperty(doc.body, "scrollHeight", {
          configurable: true,
          value: 0,
        });
        // No horizontal scrollbar.
        Object.defineProperty(doc.documentElement, "clientHeight", {
          configurable: true,
          value: frame.contentWindow!.innerHeight,
        });
        frame.dispatchEvent(new Event("load"));
      });

    onHeightChange.mockClear();
    await load(536.4);
    expect(frame.style.height).toBe("537px");
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    // Throttled offscreen frames report 0; the card keeps its height.
    await load(0);
    expect(frame.style.height).toBe("537px");
    await load(2012);
    expect(frame.style.height).toBe("720px");
    await load(10);
    expect(frame.style.height).toBe("120px");
    container.remove();
  });
});
