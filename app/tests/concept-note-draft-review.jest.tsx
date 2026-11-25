/** @jest-environment jsdom */

import { beforeAll, expect, it, jest } from "@jest/globals";
import { act, type ComponentProps } from "react";

import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { EditChange } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import {
  conceptNotesI18n,
  gapRecord,
  mockTranslation,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

const i18n = await conceptNotesI18n();
mockTranslation(i18n.t.bind(i18n), i18n);

let DraftDocumentPanel: typeof import("@/components/ConceptNoteWorkspace/draft-document-panel").DraftDocumentPanel;

setupDomShims();
const view = setupTestRoot(appTheme);
beforeAll(async () => {
  ({ DraftDocumentPanel } =
    await import("@/components/ConceptNoteWorkspace/draft-document-panel"));
});

it("keeps validation findings, inline decisions, markers and chapter confirmation together", async () => {
  const question = "Who signs the city's O&M contract?";
  const second = gapRecord("contract", { question });
  const chapter: ConceptNoteDraftChapter = {
    chapter_id: "chapter-1",
    title: "Budget",
    template_section_id: "budget",
    position: 0,
    required: true,
    user_locked: false,
    status: "draft",
    body_markdown:
      "Budget is 10. [Information needed: Confirm funding] [Information needed: **Who signs the city’s O&M contract**?]",
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    gaps: [second],
    open_gap_count: 0,
    caveat_count: 0,
  };
  const change: EditChange = {
    change_id: "change-1",
    chapter_id: chapter.chapter_id,
    chapter_title: chapter.title,
    base_revision: 1,
    start: 10,
    before: "10",
    after: "20",
    kind: "wording",
    group_id: "group-1",
    source_refs: [],
    user_input_quote: null,
  };
  const selectChapter = jest.fn();
  const onFocusedChapterChange = jest.fn();
  const onAcceptReviewChange = jest.fn();
  const onConfirmChapter = jest.fn();
  const onAnswerGap = jest.fn();
  const props: ComponentProps<typeof DraftDocumentPanel> = {
    chapters: [chapter],
    lng: "en",
    noteName: "Tram project",
    focusFindingKey: "finding-1",
    isConfirmingChapter: false,
    onConfirmChapter,
    onAnswerGap,
    onFocusedChapterChange,
    onAcceptReviewChange,
    focus: {
      chapterElements: { current: {} },
      previewElement: { current: null },
      focusedFindingElement: { current: null },
      isChapterPanelOpen: true,
      selectedChapterId: chapter.chapter_id,
      selectChapter,
      toggleChapterPanel: jest.fn(),
      focusedFinding: {
        chapterId: chapter.chapter_id,
        finding: {
          phase: "consistency",
          category: "budget",
          severity: "warning",
          message: "Check the total budget",
          suggested_action: "Confirm the total",
          involved_chapter_ids: [chapter.chapter_id],
          evidence: [],
        },
      },
    },
  };
  const render = (overrides: Partial<typeof props> = {}) =>
    view.render(<DraftDocumentPanel {...props} {...overrides} />);
  await render();
  expect(
    view.container.querySelector('[data-testid="focused-review-finding"]')
      ?.textContent,
  ).toContain("Check the total budget");
  expect(view.byTestId("concept-note-section-gap-count")?.textContent).toBe(
    "2",
  );
  expect(view.button("Review & confirm")).toBeUndefined();
  const marker = () =>
    view.container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-gap-marker"]',
    )!;
  // A parent re-render must not remount the marker and close its popover.
  await act(async () => marker().click());
  await render({ isConfirmingChapter: true });
  expect(marker().getAttribute("aria-expanded")).toBe("true");
  await act(async () => marker().click());
  // A formatted marker and a legacy marker share a passage. Select the named record.
  await act(async () =>
    view.byTestId("concept-note-chapter-gaps-toggle")!.click(),
  );
  const rows = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="concept-note-gap-list-item"]',
    ),
  ];
  await act(async () =>
    rows.find((row) => row.textContent?.includes(question))!.click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-chapter-gap-answer"]',
      )!
      .click(),
  );
  expect(onAnswerGap).toHaveBeenCalledWith(
    chapter,
    expect.objectContaining({ id: "contract", question }),
  );
  await render({
    reviewChanges: [change],
    activeChangeId: change.change_id,
    editFocus: {
      chapterId: chapter.chapter_id,
      changeId: change.change_id,
      requestId: "request-1",
      focus: true,
    },
  });
  await act(async () => {
    await new Promise(requestAnimationFrame);
  });
  expect(
    view.container.querySelector('[data-testid="focused-review-finding"]'),
  ).not.toBeNull();
  expect(
    view.container.querySelector('[data-testid="concept-note-inline-document"]')
      ?.textContent,
  ).toContain("20");
  expect(document.activeElement?.getAttribute("data-change-ids")).toContain(
    change.change_id,
  );
  await act(async () => {
    (
      view.container.querySelector(
        '[data-testid="concept-note-inline-accept"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onAcceptReviewChange).toHaveBeenCalledWith([change.change_id]);
  // Review & confirm appears only once the marker is gone.
  const estimate = gapRecord("budget", {
    state: "caveat",
    resolution: {
      resolution_id: "estimate",
      action: "answer",
      answer: "About 10.",
      actor_user_id: "owner",
      source_refs: [],
      created_at: "2026-11-20T10:00:00Z",
    },
  });
  const confirmed = {
    ...chapter,
    body_markdown: "Budget is about 10.",
    gaps: [estimate],
    caveat_count: 1,
  };
  await render({ chapters: [confirmed] });
  await act(async () => {
    const confirm = [...view.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Review & confirm"),
    );
    confirm?.click();
    (
      view.container.querySelector(
        '[aria-current="location"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onConfirmChapter).toHaveBeenCalledWith(confirmed);
  expect(onFocusedChapterChange).toHaveBeenCalledWith(chapter.chapter_id);
});
