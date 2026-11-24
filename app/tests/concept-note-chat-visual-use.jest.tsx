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
import { readConceptNoteThreadMessages } from "@/components/ConceptNoteWorkspace/chat-utils";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { prepareVisualDocument, ChatVisualFrame } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-frame");

// Same cases as test_concept_note_visual_tools.py (visual_unsafe_svg_use).
// Small inputs only: nesting stops at two levels, far from a slow render.
const ICON =
  '<symbol id="leaf" viewBox="0 0 9 9"><path d="M0 9L9 0"/></symbol>';
const icons = (uses: string[], defs = ICON) =>
  `<svg viewBox="0 0 320 40"><defs>${defs}</defs>${uses.join("")}<text>Trees 12</text></svg>`;
const NESTED = icons(
  ['<use href="#pair"/>'],
  `${ICON}<g id="pair"><use href="#leaf"/></g>`,
);

describe("SVG <use> references", () => {
  it.each([
    icons(['<use href="#leaf" x="0"/>', '<use href="#leaf" x="20"/>']),
    icons(['<use xlink:href="#leaf"/>']),
    icons(['<use href="#dot"/>'], '<circle id="dot" r="4"/>'),
    icons(Array(300).fill('<use href="#leaf"/>')),
  ])("keeps simple icons: %#", (html) => {
    const visual = prepareVisualDocument(html);

    expect(visual.rejected).toBeUndefined();
    expect(visual.srcDoc).toMatch(/<use (xlink:)?href="#(leaf|dot)"/);
  });

  it.each([
    ["301 uses", icons(Array(301).fill('<use href="#leaf"/>'))],
    ["a group holding a use", NESTED],
    ["a use", icons(['<use id="a" href="#leaf"/>', '<use xlink:href="#a"/>'])],
    ["a missing id", icons(['<use href="#missing"/>'])],
    ["a repeated id", icons(['<use href="#leaf"/>'], ICON + ICON)],
    [
      "an HTML element",
      `${icons(['<use href="#box"/>'], "")}<p id="box">x</p>`,
    ],
    ["an external file", icons(['<use href="https://e.test/i.svg#leaf"/>'])],
  ])("refuses the whole visual for %s", (_case, html) => {
    expect(prepareVisualDocument(html)).toEqual({
      srcDoc: "",
      hasContent: false,
      rejected: true,
    });
  });
});

describe("reopening a note with a saved unsafe visual", () => {
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

  it("shows the title and a note for it while the rest of the thread renders", async () => {
    // The thread endpoint returns visuals from both storage formats in this
    // shape (test_visual_history_restore.py).
    const messages = readConceptNoteThreadMessages({
      messages: [
        { role: "user", text: "Show the tree icons" },
        {
          role: "assistant",
          text: "Here are the trees.",
          visuals: [
            { title: "Nested icons", html: NESTED },
            { title: "Plain icons", html: icons(['<use href="#leaf"/>']) },
          ],
        },
        { role: "user", text: "Thanks" },
      ],
    });

    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          {messages.map((message) => (
            <div key={message.id}>
              <p>{message.text}</p>
              {message.visuals?.map((visual) => (
                <ChatVisualFrame
                  key={visual.title}
                  lng="en"
                  title={visual.title}
                  html={visual.html}
                />
              ))}
            </div>
          ))}
        </ChakraProvider>,
      ),
    );

    const [refused, plain] = container.querySelectorAll(
      '[data-testid="concept-note-chat-visual"]',
    );
    expect(refused.textContent).toContain("Nested icons");
    expect(
      refused.querySelector('[data-testid="concept-note-chat-visual-rejected"]')
        ?.textContent,
    ).toBe("chat-visual-rejected");
    expect(refused.querySelector("iframe")).toBeNull();
    // No Expand either, so the dialog never gets the visual.
    expect(
      refused.querySelector<HTMLButtonElement>("button[aria-label]")?.hidden,
    ).toBe(true);

    expect(plain.querySelector("iframe")?.getAttribute("srcdoc")).toContain(
      '<use href="#leaf"',
    );
    expect(container.textContent).toContain("Here are the trees.");
    expect(container.textContent).toContain("Thanks");
  });
});
