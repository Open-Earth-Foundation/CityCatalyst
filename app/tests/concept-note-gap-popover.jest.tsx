/** @jest-environment jsdom */

import { act } from "react";
import { expect, it, jest } from "@jest/globals";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import {
  conceptNotesI18n,
  draftChapter,
  gapRecord,
  mockTranslation,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

// A real i18next instance with the app's defaults (app/src/i18n/settings.ts
// sets no interpolation options), so interpolated values are HTML-escaped
// unless a call opts out, exactly as in production.
const i18n = await conceptNotesI18n({ namespaced: true });
mockTranslation(i18n.getFixedT("en", "concept-notes"), i18n);

const { DraftDocumentPanel } =
  await import("@/components/ConceptNoteWorkspace/draft-document-panel");

const TRICKY_QUESTION =
  "Confirm the contractor's \"operation & maintenance\" (O&M) obligations and/or the city's fallback.";
const TRICKY_TITLE = "Risks & mitigation / O&M";

setupDomShims();
const view = setupTestRoot(appTheme);

it("opens the selected question when two gaps share a heading", async () => {
  const formatted = TRICKY_QUESTION.replace(
    "city's fallback.",
    "city’s  fallback",
  );
  const otherQuestion = "Who approves the contract?";
  const chapter = draftChapter({
    title: TRICKY_TITLE,
    body_markdown: `### Procurement\n\n[Information needed: ${otherQuestion}] [Information needed: **${formatted}**]`,
    gaps: [
      gapRecord("approval", { question: otherQuestion }),
      gapRecord("obligations", { question: TRICKY_QUESTION }),
    ],
    open_gap_count: 2,
  });
  const answer = jest.fn();
  await view.render(
    <DraftDocumentPanel
      chapters={[chapter]}
      lng="en"
      noteName={`Lima's "Phase 2" & co`}
      focusFindingKey={null}
      isConfirmingChapter={false}
      onAnswerGap={answer}
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

  const marker = [
    ...view.container.querySelectorAll(
      '[data-testid="concept-note-gap-marker"]',
    ),
  ].find((element) =>
    element.getAttribute("aria-label")?.includes(TRICKY_QUESTION),
  );
  expect(marker?.textContent).toBe("2");
  await act(async () =>
    view
      .byTestId<HTMLButtonElement>("concept-note-chapter-gaps-toggle")!
      .click(),
  );
  const rows = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="concept-note-gap-list-item"]',
    ),
  ];
  const selected = rows.find((row) =>
    row.textContent?.includes(TRICKY_QUESTION),
  )!;
  await act(async () => selected.click());
  expect(
    document.querySelector('[data-testid="concept-note-chapter-gap"]')
      ?.textContent,
  ).toContain("Because obligations.");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gap-answer"]',
      )!
      .click(),
  );
  expect(answer).toHaveBeenCalledWith(
    chapter,
    expect.objectContaining({ id: "obligations", question: TRICKY_QUESTION }),
  );
});
