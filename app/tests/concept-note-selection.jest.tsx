/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import {
  Request as FetchRequest,
  Response as FetchResponse,
  Headers as FetchHeaders,
} from "node-fetch";
import translations from "@/i18n/locales/en/concept-notes.json";
import {
  captureDraftSelection,
  textSourceBoundaries,
} from "@/components/ConceptNoteWorkspace/draft-selection";
import {
  remarkDocumentFonts,
  remarkSelectionSource,
} from "@/components/ConceptNoteWorkspace/selection-markdown";
import { DocumentFontSpan } from "@/components/ConceptNoteWorkspace/document-font-span";
import type { EditProposal } from "@/util/concept-note-edit-types";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

const chapterId = "10000000-0000-4000-8000-000000000001";
const runId = "10000000-0000-4000-8000-000000000002";
let root: Root | undefined;
let container: HTMLDivElement;
let api: typeof import("@/services/api").api;
let SelectableChapter: typeof import("@/components/ConceptNoteWorkspace/selection-toolbar").SelectableChapter;
let EditDiff: typeof import("@/components/ConceptNoteWorkspace/edit-diff").EditDiff;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(globalThis, {
    Request: class extends FetchRequest {
      constructor(input: string | FetchRequest, init?: never) {
        super(
          typeof input === "string" && input.startsWith("/")
            ? `http://localhost${input}`
            : input,
          init,
        );
      }
    },
    Response: FetchResponse,
    Headers: FetchHeaders,
    structuredClone: (value: unknown) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value)),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Range.prototype.getBoundingClientRect = () => ({
    top: 200,
    bottom: 224,
    left: 300,
    right: 650,
    width: 350,
    height: 24,
    x: 300,
    y: 200,
    toJSON() {},
  });
  ({ api } = await import("@/services/api"));
  ({ SelectableChapter } =
    await import("@/components/ConceptNoteWorkspace/selection-toolbar"));
  ({ EditDiff } = await import("@/components/ConceptNoteWorkspace/edit-diff"));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  window.getSelection()?.removeAllRanges();
  globalThis.fetch = originalFetch;
});

function content(markdown: string) {
  return (
    <ReactMarkdown
      components={{ span: DocumentFontSpan }}
      remarkPlugins={[
        remarkGfm,
        remarkDocumentFonts,
        [remarkSelectionSource, { title: "Summary" }],
      ]}
    >
      {markdown}
    </ReactMarkdown>
  );
}

async function preview(markdown: string) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <ChakraProvider value={defaultSystem}>
        {content(markdown)}
      </ChakraProvider>,
    ),
  );
}

function select(span: Element, from = 0, to = span.textContent!.length) {
  const range = document.createRange();
  range.setStart(span.firstChild!, from);
  range.setEnd(span.firstChild!, to);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

it("maps the selected occurrence, original title offset and Unicode codepoints instead of searching rendered text", async () => {
  const markdown = "## Summary\n\n😀 Same sentence.\n\nSame sentence.";
  await preview(markdown);
  expect(container.querySelector("h2")).toBeNull();
  const spans = container.querySelectorAll("[data-cc-source-start]");
  const result = captureDraftSelection(
    container,
    markdown,
    chapterId,
    7,
    select(spans[1]),
  );
  expect(result?.scope).toEqual({
    kind: "selection",
    chapter_id: chapterId,
    base_revision: 7,
    start: Array.from("## Summary\n\n😀 Same sentence.\n\n").length,
    end: Array.from(markdown).length,
    selected_markdown: "Same sentence.",
  });
});

it("maps escapes, entities, CRLF and surrogate pairs without guessing ambiguous source boundaries", async () => {
  const markdown = "😀 Literal \\*star\\* &amp; value.";
  await preview(markdown);
  const span = container.querySelector("[data-cc-source-start]")!;
  const result = captureDraftSelection(
    container,
    markdown,
    chapterId,
    1,
    select(span, 11, 19),
  );
  expect(result?.scope.selected_markdown).toBe("\\*star\\* &amp;");
  expect(textSourceBoundaries("a\r\nb", "a\nb")).toEqual([0, 1, 3, 4]);
  expect(textSourceBoundaries("😀", "😀")).toEqual([0, null, 2]);
  expect(textSourceBoundaries("source", "different")).toBeNull();
  expect(
    captureDraftSelection(
      container,
      markdown,
      chapterId,
      1,
      select(span, 0, 1),
    ),
  ).toBeNull();
});

it("selects complete formatting wrappers, preserves mixed Markdown and reports explicit Bold off", async () => {
  const markdown =
    '<span data-cc-font="serif" data-cc-bold="false" data-cc-italic="true">**A formatted sentence.**</span>';
  await preview(markdown);
  const span = container.querySelector("[data-cc-source-start]")!;
  const result = captureDraftSelection(
    container,
    markdown,
    chapterId,
    2,
    select(span),
  );
  expect(result?.scope.selected_markdown).toBe(markdown);
  expect(result?.font).toBe("serif");
  expect(result?.bold).toBe(false);
  expect(result?.italic).toBe(true);
  expect(container.querySelector("strong")?.textContent).toBe(
    "A formatted sentence.",
  );
  const partial = captureDraftSelection(
    container,
    markdown,
    chapterId,
    2,
    select(span, 2, 11),
  );
  expect(partial?.scope.selected_markdown).toBe("formatted");
});

it("does not activate arbitrary HTML and rejects links or selection outside this chapter", async () => {
  await preview(
    '<span data-cc-font="serif" onclick="alert(1)">Unsafe</span> and [a link](https://example.com).',
  );
  expect(container.querySelector("[onclick]")).toBeNull();
  expect(container.querySelector("[data-cc-font]")).toBeNull();
  const link = container.querySelector("a")!;
  expect(
    captureDraftSelection(container, "unused", chapterId, 1, select(link)),
  ).toBeNull();
  const outside = document.createElement("p");
  outside.textContent = "Other chapter";
  document.body.append(outside);
  expect(
    captureDraftSelection(container, "unused", chapterId, 1, select(outside)),
  ).toBeNull();
  outside.remove();
});

it("renders formatting in both inline and block proposal previews without changing approval controls", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  for (const inline of [true, false]) {
    await act(async () =>
      root!.render(
        <ChakraProvider value={defaultSystem}>
          <EditDiff
            lng="en"
            inline={inline}
            change={{
              chapter_title: "Summary",
              before: "Original sentence.",
              after:
                '<span data-cc-font="serif" data-cc-bold="true">Original sentence.</span>',
            }}
            onAccept={() => {}}
            onReject={() => {}}
          />
        </ChakraProvider>,
      ),
    );
    expect(
      container.querySelector(
        '[data-testid="concept-note-edit-proposed-text"] [data-cc-font="serif"]',
      )?.textContent,
    ).toBe("Original sentence.");
    expect(
      container.querySelector('[data-testid="concept-note-inline-accept"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("<span");
  }
});

it("ignores a queued position callback after the floating toolbar has unmounted", async () => {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const listener = jest.spyOn(window, "addEventListener");
  const markdown = "A selected sentence.";
  await act(async () =>
    root!.render(
      <Provider store={store}>
        <ChakraProvider value={defaultSystem}>
          <SelectableChapter
            runId={runId}
            chapterId={chapterId}
            revision={1}
            markdown={markdown}
            lng="en"
            disabled={false}
            onProposed={async () => {}}
          >
            {content(markdown)}
          </SelectableChapter>
        </ChakraProvider>
      </Provider>,
    ),
  );
  await act(async () => {
    select(container.querySelector("[data-cc-source-start]")!);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const queued = listener.mock.calls
    .filter(([type]) => type === "scroll")
    .at(-1)?.[1] as EventListener;
  expect(queued).toBeDefined();
  await act(async () => root!.unmount());
  root = undefined;
  expect(() => queued(new Event("scroll"))).not.toThrow();
  listener.mockRestore();
});

it.each(["bold", "font", "italic", "stale"] as const)(
  "keeps a keyboard selection through toolbar focus and sends the authoritative scope (%s)",
  async (mode) => {
    const markdown = "## Summary\n\nFirst sentence.\n\nSecond sentence.";
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = jest.fn(async (input: unknown) => {
      const req = input as FetchRequest;
      const body = JSON.parse(await req.text());
      requests.push(body);
      return new FetchResponse(
        JSON.stringify(
          mode === "stale"
            ? { code: "edit_selection_stale" }
            : {
                proposal_id: "proposal",
                run_id: runId,
                scope: body.scope,
                status: "proposed",
                changes: [],
              },
        ),
        {
          status: mode === "stale" ? 409 : 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (defaults) => defaults().concat(api.middleware),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const proposed = jest.fn<
      (proposal: EditProposal, manualFormatting?: boolean) => Promise<void>
    >(async () => {});
    const render = async (revision = 4) =>
      act(async () =>
        root!.render(
          <Provider store={store}>
            <ChakraProvider value={defaultSystem}>
              <SelectableChapter
                runId={runId}
                chapterId={chapterId}
                revision={revision}
                markdown={markdown}
                lng="en"
                disabled={false}
                onProposed={proposed}
              >
                {content(markdown)}
              </SelectableChapter>
            </ChakraProvider>
          </Provider>,
        ),
      );
    await render();
    const capture = async () =>
      act(async () => {
        select(container.querySelectorAll("[data-cc-source-start]")[1]);
        document.dispatchEvent(new Event("selectionchange"));
      });
    await capture();
    expect(
      document.querySelector('[data-testid="concept-note-selection-toolbar"]'),
    ).not.toBeNull();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          altKey: true,
          bubbles: true,
        }),
      ),
    );
    expect(document.activeElement?.textContent).toContain("Ask for changes");
    const bar = document.querySelector('[role="toolbar"]')!;
    expect(bar.querySelectorAll("a")).toHaveLength(0);
    if (!("focusGroup" in HTMLElement.prototype)) {
      expect(bar.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        ),
      );
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Font");
    }
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    await capture();
    const button = (label: string) =>
      document.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )!;
    if (mode !== "stale") {
      await act(async () => {
        button("Bold").focus();
        window.getSelection()?.removeAllRanges();
        document.dispatchEvent(new Event("selectionchange"));
      });
      expect(document.querySelector('[role="toolbar"]')).not.toBeNull();
      await act(async () => {
        if (mode === "font") {
          const select = document.querySelector<HTMLSelectElement>(
            'select[aria-label="Font"]',
          )!;
          select.value = "serif";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } else button(mode === "bold" ? "Bold" : "Italic").click();
      });
      expect(requests[0].formatting).toEqual(
        mode === "font" ? { font: "serif" } : { [mode]: true },
      );
      expect(proposed).toHaveBeenCalledTimes(1);
      expect(proposed.mock.calls[0]?.[1]).toBe(true);
      expect(container.textContent).toContain("Second sentence.");
      expect(container.querySelector('[data-cc-bold="true"]')).toBeNull();
    } else {
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>(
            '[data-testid="concept-note-selection-ask"]',
          )!
          .click(),
      );
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
      await act(async () => {
        textarea.focus();
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(textarea, "Simplify this sentence; retain its facts.");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await render(4);
      expect(document.querySelector("textarea")).toBe(textarea);
      expect(textarea.value).toBe("Simplify this sentence; retain its facts.");
      await act(async () =>
        document
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      expect(document.querySelector('[role="alert"]')).not.toBeNull();
      expect(textarea.value).toBe("Simplify this sentence; retain its facts.");
      expect(requests).toHaveLength(1);
      expect(proposed).not.toHaveBeenCalled();
      await render(5);
      expect(document.querySelector('[role="toolbar"]')).toBeNull();
    }
    expect(requests[0].scope).toEqual({
      kind: "selection",
      chapter_id: chapterId,
      base_revision: 4,
      start: Array.from("## Summary\n\nFirst sentence.\n\n").length,
      end: Array.from(markdown).length,
      selected_markdown: "Second sentence.",
    });
    await act(async () => store.dispatch(api.util.resetApiState()));
  },
);
