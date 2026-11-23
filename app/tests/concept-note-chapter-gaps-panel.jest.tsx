/** @jest-environment jsdom */

import { act } from "react";
import { expect, it, jest } from "@jest/globals";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";
import ReactMarkdown from "react-markdown";
import {
  gapRecord,
  mockTranslation,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

mockTranslation((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key,
);

const { ChapterGapsPanel, ChapterGapMarker, chapterGapRows } =
  await import("@/components/ConceptNoteWorkspace/chapter-gaps-panel");
const { remarkMissingInformation, remarkGapPassages } =
  await import("@/components/ConceptNoteWorkspace/draft-markdown");

setupDomShims();
const view = setupTestRoot(appTheme);

const gap = (id: string, state: ConceptNoteGap["state"]) =>
  gapRecord(id, { state, severity: id === "b" ? "noncritical" : "critical" });

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

it("lists only open gaps and falls back to marker messages", () => {
  expect(chapterGapRows(chapter).map((row) => row.id)).toEqual(["a", "b"]);
  const fallback = chapterGapRows({
    ...chapter,
    gaps: [],
    body_markdown: "[Information needed: Provide the opening date.]",
  });
  expect(fallback).toHaveLength(1);
  expect(fallback[0]?.question).toBe("Provide the opening date.");
  expect(fallback[0]?.severity).toBe("critical");
});

it("matches source passages, keeps unanchored gaps, and does not resurrect resolved ones", () => {
  const markdown =
    "### Costs\n\nCosts pending.\n\n[Information needed: Question b?]\n\n[Information needed: Question c?]\n\n### Timing\n\n[Information needed: New question?]";
  const rows = chapterGapRows({ ...chapter, body_markdown: markdown });
  expect(rows.map((row) => row.id)).toEqual(["b", "marker-2", "a"]);
  expect(rows[0]?.title).toBe("Costs");
  expect(rows[1]?.title).toBe("Timing");
  expect(rows.some((row) => row.id === "c")).toBe(false);
  expect(rows[0]?.severity).toBe("noncritical");
});

it("attaches a standalone marker to its actual passage without changing the text", async () => {
  await act(async () =>
    view.root.render(
      <ReactMarkdown
        remarkPlugins={[remarkMissingInformation, remarkGapPassages]}
      >
        {
          "### Costs\n\nThe cost needs confirmation.\n\n[Information needed: Question a?]\n\n[Information needed: Question b?]\n\n### Timing\n\nThe opening date is pending."
        }
      </ReactMarkdown>,
    ),
  );
  const paragraphs = view.container.querySelectorAll("p");
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
  const row = chapterGapRows(chapter)[1]!;
  await view.render(
    <>
      <ChapterGapMarker
        chapter={chapter}
        lng="en"
        row={row}
        number={4}
        onAnswerGap={onAnswerGap}
      />
      {/* Stand-in for the answer form heading that opens in the chat panel. */}
      <p tabIndex={-1} data-testid="concept-note-gap-answer-heading" />
    </>,
  );
  const marker = view.byTestId<HTMLButtonElement>("concept-note-gap-marker")!;
  expect(marker.textContent).toBe("4");
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
  // Closing hands keyboard focus to the opened form, not back to the marker.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(document.activeElement?.getAttribute("data-testid")).toBe(
    "concept-note-gap-answer-heading",
  );
});

it("shows answers saved so far on the marker, in the gap list and apart from an estimate", async () => {
  const saved = "1. Question a?\nGrant\n\n2. Amount?\nNot decided yet";
  const estimate =
    "The request is approximately $2 million; not yet confirmed.";
  const confirming = "Confirmed by the lender: $2 million.";
  const estimated = {
    ...gap("d", "caveat"),
    version: 2,
    answered_so_far: confirming,
    resolution: {
      resolution_id: "r-d",
      action: "answer" as const,
      answer: estimate,
      actor_user_id: "owner",
      source_refs: [],
      created_at: "2026-09-24T00:00:00Z",
    },
  };
  const answered = {
    ...chapter,
    gaps: [
      { ...gap("a", "open"), answered_so_far: saved },
      gap("b", "open"),
      estimated,
    ],
  };
  const rows = chapterGapRows(answered);
  expect(rows.map((row) => row.id)).toEqual(["a", "b", "d"]);
  const onAnswerGap = jest.fn();
  await view.render(
    <>
      <ChapterGapMarker chapter={answered} lng="en" row={rows[0]!} number={1} />
      <ChapterGapsPanel
        chapter={answered}
        lng="en"
        rows={rows}
        onAnswerGap={onAnswerGap}
      />
    </>,
  );
  const element = (id: string) =>
    document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  await act(async () => element("concept-note-gap-marker").click());
  expect(element("concept-note-gap-answered-so-far").textContent).toContain(
    saved,
  );
  expect(element("concept-note-chapter-gaps").textContent).toContain(
    'chapter-open-gaps:{"count":2}',
  );
  await act(async () => element("concept-note-chapter-gaps-toggle").click());
  const items = document.querySelectorAll<HTMLButtonElement>(
    '[data-testid="concept-note-gap-list-item"]',
  );
  expect(items[0].textContent).toContain("gap-answered-so-far");
  expect(items[1].textContent).not.toContain("gap-answered-so-far");
  await act(async () => items[2].click());
  const estimateBlock = element("concept-note-gap-estimate");
  const detail = estimateBlock.closest(
    '[data-testid="concept-note-chapter-gap"]',
  )!;
  expect(estimateBlock.textContent).toContain(estimate);
  expect(
    detail.querySelector('[data-testid="concept-note-gap-answered-so-far"]')
      ?.textContent,
  ).toContain(confirming);
  await act(async () =>
    detail
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gap-answer"]',
      )!
      .click(),
  );
  expect(onAnswerGap).toHaveBeenCalledWith(
    answered,
    expect.objectContaining({ id: "d" }),
  );
});
