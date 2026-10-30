/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";
import ReactMarkdown from "react-markdown";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

const { ChapterGapsPanel, ChapterGapMarker, chapterGapRows } =
  await import("@/components/ConceptNoteWorkspace/chapter-gaps-panel");
const { splitStandaloneMarkers, remarkMissingInformation, remarkGapPassages } =
  await import("@/components/ConceptNoteWorkspace/draft-markdown");

let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;

function gap(id: string, state: ConceptNoteGap["state"]): ConceptNoteGap {
  return {
    gap_id: id,
    field_key: id,
    question: `Question ${id}?`,
    why_asking: `Because ${id}.`,
    severity: id === "b" ? "noncritical" : "critical",
    state,
    suggestions: [],
    source_refs: [],
    version: 1,
    resolution: null,
    created_at: "2026-09-24T00:00:00Z",
    updated_at: "2026-09-24T00:00:00Z",
  };
}

const chapter: ConceptNoteDraftChapter = {
  chapter_id: "ch-1",
  template_section_id: null,
  title: "Funding breakdown",
  position: 1,
  status: "draft",
  required: true,
  user_locked: false,
  body_markdown: "Body",
  gaps: [gap("a", "open"), gap("b", "open"), gap("c", "resolved")],
  open_gap_count: 2,
  caveat_count: 0,
  revision_number: 1,
  confirmed_body_markdown: null,
  confirmed_revision_number: null,
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

it("moves standalone marker lines out of the prose and keeps inline ones", () => {
  const result = splitStandaloneMarkers(
    [
      "The tunnel is 1,230 m long.",
      "",
      "[Information needed: Provide the opening date.]",
      "- [Information needed: State the USD amount requested.]",
      "",
      "Costs are [Information needed: confirm currency] pending.",
    ].join("\n"),
  );
  expect(result.messages).toEqual([
    "Information needed: Provide the opening date.",
    "Information needed: State the USD amount requested.",
  ]);
  expect(result.markdown).toBe(
    "The tunnel is 1,230 m long.\n\nCosts are [Information needed: confirm currency] pending.",
  );
});

it("lists only open gaps and falls back to marker messages", () => {
  expect(chapterGapRows(chapter, []).map((row) => row.id)).toEqual(["a", "b"]);
  const fallback = chapterGapRows({ ...chapter, gaps: [] }, [
    "Information needed: Provide the opening date.",
  ]);
  expect(fallback).toHaveLength(1);
  expect(fallback[0]?.question).toBe("Provide the opening date.");
  expect(fallback[0]?.severity).toBe("critical");
});

it("keeps counts visible and opens only the selected question with its rationale", async () => {
  const onAnswerGap = jest.fn();
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <ChapterGapsPanel
          chapter={chapter}
          lng="en"
          rows={chapterGapRows(chapter, [])}
          onAnswerGap={onAnswerGap}
        />
      </ChakraProvider>,
    ),
  );
  const panel = container.querySelector(
    '[data-testid="concept-note-chapter-gaps"]',
  );
  expect(panel?.getAttribute("data-state")).toBe("closed");
  expect(panel?.textContent).toContain('chapter-open-gaps:{"count":2}');
  expect(panel?.textContent).toContain(
    'gap-counts:{"required":1,"optional":1}',
  );
  expect(
    container.querySelectorAll('[data-testid="concept-note-chapter-gap"]'),
  ).toHaveLength(0);

  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chapter-gaps-toggle"]',
  );
  await act(async () => {
    toggle?.click();
  });
  const rows = document.querySelectorAll(
    '[data-testid="concept-note-gap-list-item"]',
  );
  expect(rows).toHaveLength(2);
  expect(rows[1]?.getAttribute("data-severity")).toBe("noncritical");
  expect(
    document.querySelector('[data-testid="concept-note-chapter-gap"]'),
  ).toBeNull();
  await act(async () => {
    (rows[0] as HTMLButtonElement).click();
  });
  const detail = document.querySelector(
    '[data-testid="concept-note-chapter-gap"]',
  );
  expect(detail?.textContent).toContain("Question a?");
  expect(detail?.textContent).toContain("Because a.");
  expect(detail?.textContent).toContain("gap-clima-rationale");
  expect(
    detail?.querySelector('[data-testid="concept-note-gap-number"]')
      ?.textContent,
  ).toBe('gap-number:{"number":1}');

  const answer = detail?.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chapter-gap-answer"]',
  );
  await act(async () => {
    answer?.click();
  });
  expect(onAnswerGap).toHaveBeenCalledWith(
    chapter,
    expect.objectContaining({ id: "a", question: "Question a?" }),
  );
});

it("matches source passages, keeps unanchored gaps, and does not resurrect resolved ones", () => {
  const markdown =
    "### Costs\n\nCosts pending.\n\n[Information needed: Question b?]\n\n### Timing\n\n[Information needed: New question?]";
  const rows = chapterGapRows({ ...chapter, body_markdown: markdown }, [
    "Information needed: Question b?",
    "Information needed: Question c?",
    "Information needed: New question?",
  ]);
  expect(rows.map((row) => row.id)).toEqual(["b", "marker-2", "a"]);
  expect(rows[0]?.title).toBe("Costs");
  expect(rows[1]?.title).toBe("Timing");
  expect(rows.some((row) => row.id === "c")).toBe(false);
  expect(rows[0]?.severity).toBe("noncritical");
});

it("attaches a standalone marker to its actual passage without changing the text", async () => {
  await act(async () =>
    root.render(
      <ReactMarkdown
        remarkPlugins={[remarkMissingInformation, remarkGapPassages]}
      >
        {
          "### Costs\n\nThe cost needs confirmation.\n\n[Information needed: Question a?]\n\n[Information needed: Question b?]\n\n### Timing\n\nThe opening date is pending."
        }
      </ReactMarkdown>,
    ),
  );
  const paragraphs = container.querySelectorAll("p");
  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0]?.querySelector("a")?.getAttribute("href")).toBe(
    "#cnb-missing-information",
  );
  expect(paragraphs[0]?.textContent).toContain("The cost needs confirmation.");
  expect(
    [...paragraphs[0]!.querySelectorAll("a")].map((link) =>
      decodeURIComponent(link.title),
    ),
  ).toEqual([
    "Information needed: Question a?",
    "Information needed: Question b?",
  ]);
  expect(paragraphs[1]?.textContent).toBe("The opening date is pending.");
});

it("opens a numbered optional marker and routes the exact gap into chat", async () => {
  const onAnswerGap = jest.fn();
  const row = chapterGapRows(chapter, [])[1]!;
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <ChapterGapMarker
          chapter={chapter}
          lng="en"
          row={row}
          number={4}
          onAnswerGap={onAnswerGap}
        />
      </ChakraProvider>,
    ),
  );
  const marker = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-gap-marker"]',
  )!;
  expect(marker.textContent).toBe("4");
  expect(marker.getAttribute("data-severity")).toBe("noncritical");
  await act(async () => marker.click());
  expect(
    document.querySelector('[data-testid="concept-note-chapter-gap"]')
      ?.textContent,
  ).toContain("Because b.");
  expect(
    document.querySelector('[data-testid="concept-note-gap-number"]')
      ?.textContent,
  ).toBe('gap-number:{"number":4}');
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gap-answer"]',
      )!
      .click(),
  );
  expect(onAnswerGap).toHaveBeenCalledWith(
    chapter,
    expect.objectContaining({ id: "b" }),
  );
  expect(marker.getAttribute("aria-expanded")).toBe("false");
});
