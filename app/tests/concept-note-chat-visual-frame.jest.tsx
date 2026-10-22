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
  it("puts the CSP before model content and replaces the model doctype", () => {
    const html = '  <!DOCTYPE html><meta http-equiv="refresh"><div id="chart">';
    const doc = buildSandboxedVisualDocument(html);

    expect(doc.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(doc.match(/<!doctype/gi)).toHaveLength(1);
    const csp = doc.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp).toBeGreaterThan(doc.indexOf('<meta charset="utf-8">'));
    expect(csp).toBeLessThan(doc.indexOf('http-equiv="refresh"'));
    expect(doc).toContain("connect-src 'none'");
    expect(doc.endsWith('<div id="chart">')).toBe(true);
    // The height reporter must run before any model script can shadow `parent`.
    const reporter = doc.indexOf("cnb-visual-height");
    expect(reporter).toBeGreaterThan(csp);
    expect(reporter).toBeLessThan(doc.indexOf('http-equiv="refresh"'));
  });
});

describe("ChatVisualFrame", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders the visual in a script-only sandbox", async () => {
    const title = "Emissions (tCO2e/yr) & targets";
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualFrame lng="en" title={title} html="<svg></svg>" />
        </ChakraProvider>,
      ),
    );

    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("title")).toBe(title);
    expect(frame.getAttribute("srcdoc")).toContain("<svg></svg>");
    expect(container.textContent).toContain("chat-visual-label");
    // The accessible name must carry the raw title, not HTML entities.
    const labels = Array.from(container.querySelectorAll("[aria-label]")).map(
      (element) => element.getAttribute("aria-label"),
    );
    expect(labels).toContain(`Expand visual: ${title}`);
  });

  it("fits the inline frame to heights its own visual reports", async () => {
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
    const report = (height: unknown, source = frame.contentWindow) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "cnb-visual-height", height },
            source,
          }),
        );
      });

    expect(frame.style.height).toBe("420px");
    // Throttled offscreen frames report 0; the card keeps its default.
    await report(0);
    expect(frame.style.height).toBe("420px");
    onHeightChange.mockClear();
    await report(536.4);
    expect(frame.style.height).toBe("537px");
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    await report(2012);
    expect(frame.style.height).toBe("720px");
    await report(10);
    expect(frame.style.height).toBe("120px");
    // Another frame or a malformed height must not resize this card.
    await report(300, window);
    await report("tall");
    expect(frame.style.height).toBe("120px");
    container.remove();
  });
});
