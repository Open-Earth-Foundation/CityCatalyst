/** @jest-environment jsdom */

import { act } from "react";
import { expect, it, jest } from "@jest/globals";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteGap } from "@/util/types";
import ReactMarkdown from "react-markdown";
import {
  draftChapter,
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

const chapter = draftChapter({
  title: "Funding breakdown",
  position: 1,
  gaps: [gap("a", "open"), gap("b", "open"), gap("c", "resolved")],
});

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

it("keeps an accepted estimate listed as to be confirmed, after the open gaps", async () => {
  const estimated = {
    ...gap("d", "caveat"),
    version: 2,
    resolution: {
      resolution_id: "r-d",
      action: "answer" as const,
      answer: "The request is approximately $2 million; not yet confirmed.",
      actor_user_id: "owner",
      source_refs: [],
      created_at: "2026-09-24T00:00:00Z",
    },
  };
  const withEstimate = { ...chapter, gaps: [estimated, ...chapter.gaps] };
  const rows = chapterGapRows(withEstimate);
  // No marker is left for an estimate, so it follows the open gaps.
  expect(rows.map((row) => row.id)).toEqual(["a", "b", "d"]);
  const onAnswerGap = jest.fn();
  await view.render(
    <ChapterGapsPanel
      chapter={withEstimate}
      lng="en"
      rows={rows}
      onAnswerGap={onAnswerGap}
    />,
  );
  const panel = view.byTestId("concept-note-chapter-gaps");
  // Estimates are not counted as open gaps.
  expect(panel?.textContent).toContain('chapter-open-gaps:{"count":2}');
  await act(async () =>
    view.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gaps-toggle"]',
      )!
      .click(),
  );
  const items = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="concept-note-gap-list-item"]',
    ),
  ];
  expect(items.at(-1)?.textContent).toContain("gap-state-caveat");
  await act(async () => items.at(-1)!.click());
  const details = document.querySelector(
    '[data-testid="concept-note-chapter-gap"]',
  );
  expect(details?.getAttribute("data-state")).toBe("caveat");
  expect(
    document.querySelector('[data-testid="concept-note-gap-estimate"]')
      ?.textContent,
  ).toContain("approximately $2 million");
  const confirm = document.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chapter-gap-answer"]',
  )!;
  await act(async () => confirm.click());
  expect(onAnswerGap).toHaveBeenCalledWith(
    withEstimate,
    expect.objectContaining({ id: "d" }),
  );
  // Let the closing popover settle its focus before the next test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
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
  await view.render(
    <>
      <ChapterGapMarker chapter={answered} lng="en" row={rows[0]!} number={1} />
      <ChapterGapsPanel chapter={answered} lng="en" rows={rows} />
    </>,
  );
  await act(async () =>
    view.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-gap-marker"]',
      )!
      .click(),
  );
  // Saved answers are visible to everyone who opens the gap, not yet in the text.
  const box = document.querySelector(
    '[data-testid="concept-note-gap-answered-so-far"]',
  );
  expect(box?.textContent).toContain(saved);
  await act(async () =>
    view.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gaps-toggle"]',
      )!
      .click(),
  );
  const items = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="concept-note-gap-list-item"]',
    ),
  ];
  expect(items[0].textContent).toContain(
    "gap-severity-critical · gap-answered-so-far",
  );
  expect(items[1].textContent).not.toContain("gap-answered-so-far");

  // An estimate and the answers saved to confirm it stay in separate blocks.
  await act(async () => items[2].click());
  const estimateBlock = document.querySelector(
    '[data-testid="concept-note-gap-estimate"]',
  );
  const savedBlock = estimateBlock
    ?.closest('[data-testid="concept-note-chapter-gap"]')
    ?.querySelector('[data-testid="concept-note-gap-answered-so-far"]');
  expect(estimateBlock?.textContent).toContain(estimate);
  expect(estimateBlock?.textContent).not.toContain(confirming);
  expect(savedBlock?.textContent).toContain(confirming);
  expect(savedBlock?.textContent).not.toContain(estimate);
  // Let the popover settle its focus before the next test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
