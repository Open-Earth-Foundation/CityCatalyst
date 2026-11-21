/** @jest-environment jsdom */

// Gap popovers in the draft preview: screen-reader labels keep the literal
// text, rows of the "View all" list tell gaps apart, the long text scrolls
// above a pinned "Answer in chat", and the marker opens where it fits.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import i18next from "i18next";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

// A real i18next instance with the app's defaults (app/src/i18n/settings.ts
// sets no interpolation options), so interpolated values are HTML-escaped
// unless a call opts out, exactly as in production.
const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  ns: ["concept-notes"],
  defaultNS: "concept-notes",
  resources: { en: { "concept-notes": translations } },
});
const t = i18n.getFixedT("en", "concept-notes");
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t, i18n }),
}));

const { ChapterGapMarker, ChapterGapsPanel, chapterGapRows, markerPlacement } =
  await import("@/components/ConceptNoteWorkspace/chapter-gaps-panel");
const { DraftDocumentPanel } =
  await import("@/components/ConceptNoteWorkspace/draft-document-panel");

const TRICKY_QUESTION =
  "Confirm the contractor's \"operation & maintenance\" (O&M) obligations and/or the city's fallback.";
const TRICKY_TITLE = "Risks & mitigation / O&M";
const ENTITY = /&(#39|amp|quot|#x2F|lt|gt);/;

let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;

function gap(
  id: string,
  question: string,
  severity: ConceptNoteGap["severity"] = "critical",
): ConceptNoteGap {
  return {
    gap_id: id,
    field_key: id,
    question,
    why_asking: `Because ${id}.`,
    severity,
    state: "open",
    suggestions: [],
    source_refs: [],
    version: 1,
    resolution: null,
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
  };
}

function chapterWith(
  title: string,
  body: string,
  gaps: ConceptNoteGap[],
): ConceptNoteDraftChapter {
  return {
    chapter_id: "ch-1",
    template_section_id: null,
    title,
    position: 0,
    status: "draft",
    required: true,
    user_locked: false,
    body_markdown: body,
    gaps,
    open_gap_count: gaps.length,
    caveat_count: 0,
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
  };
}

async function render(node: ReactNode) {
  await act(async () =>
    root.render(<ChakraProvider value={appTheme}>{node}</ChakraProvider>),
  );
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.querySelector<T>(`[data-testid="${id}"]`);

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom lacks structuredClone.
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("labels markers, View all and section links with the literal text, not HTML entities", async () => {
  const chapter = chapterWith(
    TRICKY_TITLE,
    `Body text. [Information needed: ${TRICKY_QUESTION}]`,
    [gap("a", TRICKY_QUESTION)],
  );
  await render(
    <DraftDocumentPanel
      chapters={[chapter]}
      lng="en"
      noteName={`Lima's "Phase 2" & co`}
      focusFindingKey={null}
      isConfirmingChapter={false}
      onConfirmChapter={jest.fn()}
      focus={{
        chapterElements: { current: {} },
        previewElement: { current: null },
        focusedFindingElement: { current: null },
        isChapterPanelOpen: true,
        selectedChapterId: chapter.chapter_id,
        selectChapter: jest.fn(),
        toggleChapterPanel: jest.fn(),
        focusedFinding: null,
      }}
    />,
  );

  expect(byTestId("concept-note-gap-marker")?.getAttribute("aria-label")).toBe(
    `Gap 1 · Required: ${TRICKY_QUESTION}`,
  );
  expect(
    byTestId("concept-note-chapter-gaps-toggle")?.getAttribute("aria-label"),
  ).toBe(`View all gaps in ${TRICKY_TITLE}`);
  expect(
    document
      .querySelector(`[aria-label="Jump to ${TRICKY_TITLE}"]`)
      ?.getAttribute("aria-label"),
  ).toBe(`Jump to ${TRICKY_TITLE}`);
  // The document title is visible text built by t(), so it must stay literal too.
  expect(byTestId("concept-note-draft-preview")?.textContent).toContain(
    `Lima's "Phase 2" & co — Concept note`,
  );
  const labels = [...document.querySelectorAll("[aria-label]")].map((element) =>
    element.getAttribute("aria-label")!,
  );
  expect(labels.filter((label) => ENTITY.test(label))).toEqual([]);
  expect(byTestId("concept-note-draft-preview")?.textContent).not.toMatch(
    ENTITY,
  );
});

it("gives two gaps under one heading distinct View all rows", async () => {
  const first = "Confirm the amount of GCF funding requested.";
  const second = "Confirm the proposed GCF financial instrument.";
  const chapter = chapterWith(
    "Indicative financing",
    "### Co-financing\n\nThe city co-finances. [Information needed: Confirm the city share.]\n\n" +
      "### GCF funding request and financial instrument\n\nThe plan seeks grants. " +
      `[Information needed: ${first}] [Information needed: ${second}]`,
    [
      gap("a", "Confirm the city share."),
      gap("b", first),
      gap("c", second, "noncritical"),
    ],
  );
  await render(
    <ChapterGapsPanel
      chapter={chapter}
      lng="en"
      rows={chapterGapRows(chapter)}
    />,
  );
  await act(async () =>
    byTestId<HTMLButtonElement>("concept-note-chapter-gaps-toggle")!.click(),
  );

  const rows = [
    ...document.querySelectorAll('[data-testid="concept-note-gap-list-item"]'),
  ];
  expect(rows.map((row) => row.textContent)).toEqual([
    "1Confirm the city share.Required · Co-financing",
    `2${first}Required · GCF funding request and financial instrument`,
    `3${second}Optional · GCF funding request and financial instrument`,
  ]);
  expect(new Set(rows.map((row) => row.textContent)).size).toBe(3);
});

it("keeps Answer in chat outside the scrolling gap text", async () => {
  const long = "Confirm the complete financing plan. ".repeat(60).trim();
  const chapter = chapterWith(
    "Indicative financing",
    `Body. [Information needed: ${long}]`,
    [gap("a", long)],
  );
  const row = chapterGapRows(chapter)[0]!;
  await render(
    <ChapterGapMarker
      chapter={chapter}
      lng="en"
      row={row}
      number={1}
      onAnswerGap={jest.fn()}
    />,
  );
  await act(async () =>
    byTestId<HTMLButtonElement>("concept-note-gap-marker")!.click(),
  );

  const text = byTestId("concept-note-chapter-gap-text")!;
  const answer = byTestId("concept-note-chapter-gap-answer")!;
  expect(text.textContent).toContain(long);
  expect(text.textContent).toContain("Because a.");
  // The button is a sibling after the scroll region, so it never scrolls away.
  expect(text.contains(answer)).toBe(false);
  expect(text.parentElement).toBe(answer.parentElement);
  expect(
    text.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("opens a marker beside it on wide screens and below it on a phone", () => {
  const marker = (left: number) => {
    const element = document.createElement("button");
    element.getBoundingClientRect = () => ({ left }) as DOMRect;
    return element;
  };
  const at = (width: number, left: number) => {
    window.innerWidth = width;
    return markerPlacement(marker(left));
  };
  const originalWidth = window.innerWidth;
  try {
    // Desktop and the 768 px breakpoint: room for 360 px + 20 px on the left.
    expect(at(1440, 1340)).toBe("left-start");
    expect(at(768, 700)).toBe("left-start");
    // 360 px phone: the 328 px popover needs 348 px, the marker sits at 300.
    expect(at(360, 300)).toBe("bottom-end");
    expect(at(360, 348)).toBe("left-start");
  } finally {
    window.innerWidth = originalWidth;
  }
});
