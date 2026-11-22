/** @jest-environment jsdom */

import { beforeAll, expect, it, jest } from "@jest/globals";
import { act, type ComponentProps } from "react";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { EditChange } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import {
  draftChapter,
  gapRecord,
  mockTranslation,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

mockTranslation(
  (key: string) => translations[key as keyof typeof translations] ?? key,
);

let DraftDocumentPanel: typeof import("@/components/ConceptNoteWorkspace/draft-document-panel").DraftDocumentPanel;

setupDomShims();
const view = setupTestRoot(appTheme);
beforeAll(async () => {
  ({ DraftDocumentPanel } =
    await import("@/components/ConceptNoteWorkspace/draft-document-panel"));
});

it("keeps validation findings, inline decisions, markers and chapter confirmation together", async () => {
  const chapter: ConceptNoteDraftChapter = {
    chapter_id: "chapter-1",
    title: "Budget",
    template_section_id: "budget",
    position: 0,
    required: true,
    user_locked: false,
    status: "draft",
    body_markdown: "Budget is 10. [Information needed: Confirm funding]",
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    gaps: [],
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
  const props: ComponentProps<typeof DraftDocumentPanel> = {
    chapters: [chapter],
    lng: "en",
    noteName: "Tram project",
    focusFindingKey: "finding-1",
    isConfirmingChapter: false,
    onConfirmChapter,
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
  const marker = () =>
    view.container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-gap-marker"]',
    )!;
  // A parent re-render must not remount the marker and close its popover.
  await act(async () => marker().click());
  await render({ isConfirmingChapter: true });
  expect(marker().getAttribute("aria-expanded")).toBe("true");
  await act(async () => marker().click());
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
  await render({
    chapters: [{ ...chapter, body_markdown: "Budget is 10." }],
  });
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
  expect(onConfirmChapter).toHaveBeenCalledWith({
    ...chapter,
    body_markdown: "Budget is 10.",
  });
  expect(onFocusedChapterChange).toHaveBeenCalledWith(chapter.chapter_id);
});

it("counts open gaps and allows chapter confirmation once the last marker is removed", async () => {
  const estimate = gapRecord("gap-estimate", {
    question: "Confirm the request amount",
    state: "caveat",
    version: 2,
    resolution: {
      resolution_id: "estimate",
      action: "answer",
      answer: "About $2 million.",
      actor_user_id: "owner",
      source_refs: [],
      created_at: "2026-11-20T10:00:00Z",
    },
  });
  const complete = draftChapter({
    chapter_id: "chapter-1",
    title: "Budget",
    body_markdown: "The request is an estimated $2 million.",
    gaps: [estimate],
    caveat_count: 1,
  });
  const pending = {
    ...complete,
    // A legacy marker can lack a gap record and still block confirmation.
    body_markdown:
      complete.body_markdown +
      " [Information needed: **Who pays\nfor the pilot?**]",
  };
  const onConfirmChapter = jest.fn();
  const render = (chapter: ConceptNoteDraftChapter) =>
    view.render(
      <DraftDocumentPanel
        chapters={[chapter]}
        lng="en"
        noteName="Tram project"
        focusFindingKey={null}
        isConfirmingChapter={false}
        onConfirmChapter={onConfirmChapter}
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
  await render(pending);
  expect(view.byTestId("concept-note-section-gap-count")?.textContent).toBe(
    "1",
  );
  expect(view.button("Review & confirm")).toBeUndefined();

  await render(complete);
  await act(async () => view.button("Review & confirm")!.click());
  expect(onConfirmChapter).toHaveBeenCalledWith(complete);
});
