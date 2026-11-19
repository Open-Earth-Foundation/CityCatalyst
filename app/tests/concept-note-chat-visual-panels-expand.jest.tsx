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

const { ChatVisualPanels } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-panels");

// Same shape as a real `concept_note_render_panels` answer; Risks has phases.
const RISKS =
  "<p>winter delays</p><details><summary>Design</summary>permits</details>" +
  "<details><summary>Build</summary>frost</details>";
const PANELS = [
  { label: "Overview", html: "<p>retrofit 10 homes</p>" },
  { label: "Costs", html: "<p>EUR 125</p>" },
  { label: "Risks", html: RISKS },
];

describe("ChatVisualPanels Expand", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
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

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const tab = (scope: ParentNode, label: string) =>
    Array.from(scope.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (el) => el.textContent === label,
    )!;
  const click = (el: HTMLElement) => act(async () => el.click());
  // The frame inside the open tab panel of `scope`.
  const openFrame = (scope: ParentNode) =>
    scope.querySelector<HTMLIFrameElement>(
      '[role="tabpanel"]:not([hidden]) iframe',
    )!;
  // jsdom does not parse srcdoc; fill the frame and fire its load event.
  const load = (frame: HTMLIFrameElement, html: string) =>
    act(async () => {
      frame.contentDocument!.body.innerHTML = html;
      frame.dispatchEvent(new Event("load"));
    });
  const phases = (frame: HTMLIFrameElement) =>
    Array.from(frame.contentDocument!.querySelectorAll("details")).map(
      (d) => d.open,
    );

  it("shows the same switchable tabs in Expand and shares the choice both ways", async () => {
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualPanels lng="en" title="Retrofit" panels={PANELS} />
        </ChakraProvider>,
      ),
    );
    const card = container.querySelector<HTMLElement>(
      '[data-testid="concept-note-chat-panels"]',
    )!;
    const expandButtons = card.querySelectorAll<HTMLButtonElement>(
      '[aria-label="chat-visual-expand-label"]',
    );
    // One Expand for the whole card, none per tab.
    expect(expandButtons).toHaveLength(1);

    // Costs inline, then Expand still shows Costs with all three tabs.
    await click(tab(card, "Costs"));
    await click(expandButtons[0]);
    const modal = dialog()!;
    expect(modal).not.toBeNull();
    expect(modal.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(tab(modal, "Costs").getAttribute("aria-selected")).toBe("true");

    // Risks in the dialog, open its Build phase there.
    await click(tab(modal, "Risks"));
    const big = openFrame(modal);
    expect(big.title).toBe("Retrofit: Risks");
    await load(big, RISKS);
    await act(async () => {
      const build = big.contentDocument!.querySelectorAll("details")[1];
      build.open = true;
      build.dispatchEvent(new Event("toggle"));
    });

    // Closing returns the choice to the card.
    await click(
      modal.querySelector<HTMLButtonElement>('[aria-label="close"]')!,
    );
    for (let i = 0; i < 20 && dialog(); i++) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 25)));
    }
    expect(dialog()).toBeNull();
    expect(tab(card, "Risks").getAttribute("aria-selected")).toBe("true");
    expect(card.dataset.selectedPanel).toBe("Risks");

    // The inline Risks frame loads with the phase opened in the dialog.
    const inline = openFrame(card);
    await load(inline, RISKS);
    expect(phases(inline)).toEqual([false, true]);

    // Reopening shows Risks again and the same phases.
    await click(expandButtons[0]);
    expect(tab(dialog()!, "Risks").getAttribute("aria-selected")).toBe("true");
    const again = openFrame(dialog()!);
    await load(again, RISKS);
    expect(phases(again)).toEqual([false, true]);
  });
  // Older history can hold panels that are blank once scripts are removed.
  const SCRIPT_ONLY = "<div id='c'></div><script>c.textContent='42'</script>";
  const renderPanels = (panels: typeof PANELS) =>
    act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualPanels lng="en" title="Retrofit" panels={panels} />
        </ChakraProvider>,
      ),
    );
  const cardOf = () =>
    container.querySelector<HTMLElement>(
      '[data-testid="concept-note-chat-panels"]',
    )!;
  const expandOf = (card: HTMLElement) =>
    card.querySelector<HTMLButtonElement>(
      '[aria-label="chat-visual-expand-label"]',
    )!;
  const note = (scope: ParentNode) =>
    scope.querySelector(
      '[role="tabpanel"]:not([hidden]) [data-testid="concept-note-chat-visual-empty"]',
    );

  it("hides Expand and shows notes when every panel is blank", async () => {
    await renderPanels([
      { label: "Overview", html: SCRIPT_ONLY },
      { label: "Costs", html: '<iframe srcdoc="<p>EUR 125</p>"></iframe>' },
    ]);
    const card = cardOf();

    expect(expandOf(card).hidden).toBe(true);
    expect(card.querySelector("iframe")).toBeNull();
    expect(note(card)?.textContent).toBe("chat-visual-empty");
    await click(tab(card, "Costs"));
    expect(card.querySelector("iframe")).toBeNull();
    expect(note(card)?.textContent).toBe("chat-visual-empty");
  });

  it("shows the note, not a blank frame, for a blank panel in Expand", async () => {
    await renderPanels([
      PANELS[0],
      { label: "Costs", html: SCRIPT_ONLY },
      PANELS[2],
    ]);
    const card = cardOf();
    expect(expandOf(card).hidden).toBe(false);

    // The shared choice still carries over; the blank tab gets the note.
    await click(tab(card, "Costs"));
    await click(expandOf(card));
    const modal = dialog()!;
    expect(tab(modal, "Costs").getAttribute("aria-selected")).toBe("true");
    expect(
      modal.querySelector('[role="tabpanel"]:not([hidden]) iframe'),
    ).toBeNull();
    expect(note(modal)?.textContent).toBe("chat-visual-empty");

    // A visible panel in the dialog still uses the sandboxed frame.
    await click(tab(modal, "Risks"));
    const big = openFrame(modal);
    expect(big.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(card.dataset.selectedPanel).toBe("Risks");
  });
});
