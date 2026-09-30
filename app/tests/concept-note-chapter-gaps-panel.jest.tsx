/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

const { ChapterGapsPanel, chapterGapRows } =
  await import("@/components/ConceptNoteWorkspace/chapter-gaps-panel");
const { splitStandaloneMarkers } =
  await import("@/components/ConceptNoteWorkspace/draft-markdown");

let root: Root;
let container: HTMLDivElement;

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
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
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

it("renders collapsed, expands on click and offers Answer in chat per gap", async () => {
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
  expect(panel?.textContent).toContain('chapter-gaps-title:{"count":2}');
  expect(
    container.querySelectorAll('[data-testid="concept-note-chapter-gap"]'),
  ).toHaveLength(0);

  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chapter-gaps-toggle"]',
  );
  await act(async () => {
    toggle?.click();
  });
  const rows = container.querySelectorAll(
    '[data-testid="concept-note-chapter-gap"]',
  );
  expect(rows).toHaveLength(2);
  expect(rows[1]?.getAttribute("data-severity")).toBe("noncritical");
  expect(rows[0]?.textContent).toContain("Question a?");
  expect(rows[0]?.textContent).toContain("Because a.");

  const answer = rows[0]?.querySelector<HTMLButtonElement>(
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
