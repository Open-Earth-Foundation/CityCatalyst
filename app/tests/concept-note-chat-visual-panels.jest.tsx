/** @jest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  isSameConceptNoteVisual,
  readConceptNoteThreadMessages,
  readConceptNoteToolVisual,
} from "@/components/ConceptNoteWorkspace/chat-utils";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const PANELS = [
  { label: "Overview", html: "Retrofit 10 homes" },
  { label: "Costs", html: "EUR 125" },
  { label: "Risks", html: "Winter delays" },
];

describe("panel visual contract", () => {
  it("reads live panels from result labels and call-argument HTML", () => {
    const visual = readConceptNoteToolVisual({
      action: "concept_note.visual.render",
      success: true,
      data: {
        title: "Plan",
        kind: "panels",
        labels: PANELS.map((panel) => panel.label),
      },
      arguments: {
        title: "Plan",
        panels: PANELS.map((panel) => ({ ...panel, label: ` ${panel.label}` })),
      },
    });

    expect(visual).toEqual({ title: "Plan", panels: PANELS });
  });

  it("drops a live result whose labels and panels disagree", () => {
    expect(
      readConceptNoteToolVisual({
        action: "concept_note.visual.render",
        success: true,
        data: { title: "Plan", kind: "panels", labels: ["Overview"] },
        arguments: { panels: PANELS },
      }),
    ).toBeNull();
  });

  it("keeps single visuals and panels from history, dropping broken panels", () => {
    const [message] = readConceptNoteThreadMessages({
      messages: [
        {
          message_id: "m1",
          role: "assistant",
          text: "",
          visuals: [
            { title: "Chart", html: "<svg></svg>", panels: null },
            { title: "Plan", html: null, panels: PANELS },
            { title: "Broken", panels: [PANELS[0], { label: "", html: "x" }] },
          ],
        },
      ],
    });

    expect(message.visuals).toEqual([
      { title: "Chart", html: "<svg></svg>" },
      { title: "Plan", panels: PANELS },
    ]);
  });

  it("treats a re-reported panel call as the same visual", () => {
    const a = { title: "Plan", panels: PANELS };
    expect(
      isSameConceptNoteVisual(a, { title: "Plan", panels: [...PANELS] }),
    ).toBe(true);
    expect(
      isSameConceptNoteVisual(a, { title: "Plan", panels: PANELS.slice(1) }),
    ).toBe(false);
    expect(isSameConceptNoteVisual(a, { title: "Plan", html: "x" })).toBe(
      false,
    );
  });
});

describe("ChatVisualPanels", () => {
  let ChatVisualPanels: typeof import("@/components/ConceptNoteWorkspace/chat-visual-panels").ChatVisualPanels;
  let root: Root;
  let container: HTMLDivElement;
  const originalClone = globalThis.structuredClone;
  const onHeightChange = jest.fn();

  beforeAll(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom lacks CSS.escape, which the tabs use to find the next trigger.
    globalThis.CSS ??= { escape: (value: string) => value } as typeof CSS;
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    globalThis.structuredClone = (value) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value));
    ({ ChatVisualPanels } =
      await import("@/components/ConceptNoteWorkspace/chat-visual-panels"));
  });
  afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    globalThis.structuredClone = originalClone;
  });
  beforeEach(async () => {
    onHeightChange.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <ChatVisualPanels
            lng="en"
            onHeightChange={onHeightChange}
            panels={PANELS}
            title="Retrofit plan"
          />
        </ChakraProvider>,
      ),
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const tabs = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
  const visiblePanels = () =>
    Array.from(
      container.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
    ).filter((panel) => !panel.hidden);
  // Each body is a sandboxed frame named "<title>: <label>".
  const shownFrame = () =>
    visiblePanels()[0]?.querySelector("iframe")?.getAttribute("title");
  const press = (element: HTMLElement, key: string) =>
    act(async () => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      // The tabs move focus on the next animation frame.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

  it("labels a tab list with the title and shows one panel", () => {
    const list = container.querySelector<HTMLElement>('[role="tablist"]')!;
    const heading = document.getElementById(
      list.getAttribute("aria-labelledby")!,
    );
    expect(heading?.textContent).toBe("Retrofit plan");
    // One header for the card; the tab bodies draw no header of their own.
    expect(container.textContent!.split("chat-visual-label")).toHaveLength(2);
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Costs",
      "Risks",
    ]);
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(visiblePanels()).toHaveLength(1);
    expect(shownFrame()).toBe("Retrofit plan: Overview");
    // The tab bodies stay in the script-free sandbox.
    expect(
      visiblePanels()[0].querySelector("iframe")?.getAttribute("sandbox"),
    ).toBe("allow-same-origin");
  });

  it("switches panels by click and moves tab focus with arrow, Home and End", async () => {
    await act(async () => tabs()[1].click());
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(visiblePanels()).toHaveLength(1);
    expect(shownFrame()).toBe("Retrofit plan: Costs");
    expect(onHeightChange).toHaveBeenCalled();
    // Roving tabindex: only the selected tab is in the Tab order.
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);

    // jsdom does not run the follow-up selection; real Chromium checks it.
    await act(async () => tabs()[1].focus());
    await press(tabs()[1], "ArrowRight");
    expect(document.activeElement).toBe(tabs()[2]);
    await press(tabs()[2], "Home");
    expect(document.activeElement).toBe(tabs()[0]);
    await press(tabs()[0], "End");
    expect(document.activeElement).toBe(tabs()[2]);
  });
});
