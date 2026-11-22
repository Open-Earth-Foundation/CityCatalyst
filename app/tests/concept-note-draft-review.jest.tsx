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

/** The panel's focus state with no finding selected. */
const panelFocus = (selectedChapterId: string) => ({
  chapterElements: { current: {} },
  previewElement: { current: null },
  focusedFindingElement: { current: null },
  isChapterPanelOpen: true,
  selectedChapterId,
  selectChapter: jest.fn(),
  toggleChapterPanel: jest.fn(),
  focusedFinding: null,
});

/** Renders one chapter with no finding in focus. */
const renderChapter = (chapter: ConceptNoteDraftChapter) =>
  view.render(
    <DraftDocumentPanel
      chapters={[chapter]}
      lng="en"
      noteName="Tram project"
      focusFindingKey={null}
      isConfirmingChapter={false}
      onConfirmChapter={jest.fn()}
      focus={panelFocus(chapter.chapter_id)}
    />,
  );

const estimateResolution = (answer: string) => ({
  resolution_id: "resolution-1",
  action: "answer" as const,
  answer,
  actor_user_id: "owner",
  source_refs: [],
  created_at: "2026-11-20T10:00:00Z",
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

it("counts only open gaps in the section list, not estimates to confirm", async () => {
  await renderChapter(
    draftChapter({
      chapter_id: "chapter-1",
      title: "Budget",
      body_markdown:
        "The request is an estimated $2 million. [Information needed: Confirm funding]",
      revision_number: 2,
      gaps: [
        gapRecord("gap-open", { question: "Confirm funding" }),
        gapRecord("gap-estimate", {
          question: "Confirm the request amount",
          state: "caveat",
          version: 2,
          resolution: estimateResolution(
            "The request is an estimated $2 million.",
          ),
        }),
      ],
      caveat_count: 1,
    }),
  );
  expect(view.byTestId("concept-note-section-gap-count")?.textContent).toBe(
    "1",
  );
});

it("hides Review & confirm while a raw multiline marker remains", async () => {
  const chapterWith = (overrides: Partial<ConceptNoteDraftChapter>) =>
    draftChapter({
      chapter_id: "chapter-1",
      title: "Budget",
      body_markdown: "Budget is 10.",
      ...overrides,
    });
  // A marker split across lines and bold text, claimed by a closed record.
  const multiline =
    "Budget is pending. [Information needed: **Who pays\nfor the pilot**]";
  const closedRecord = gapRecord("gap-closed", {
    question: "Who pays for the pilot?",
    state: "resolved",
    version: 2,
    resolution: estimateResolution("The city pays."),
  });
  const caveat = gapRecord("gap-estimate", {
    question: "Confirm the request amount",
    state: "caveat",
    version: 2,
    resolution: estimateResolution("About $2 million."),
  });
  async function reviewButtonFor(chapter: ConceptNoteDraftChapter) {
    await renderChapter(chapter);
    return [...view.container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Review & confirm"),
    );
  }
  // An unrecorded multiline marker hides the button.
  expect(
    await reviewButtonFor(chapterWith({ body_markdown: multiline })),
  ).toBeUndefined();
  // So does a marker whose record is already closed.
  expect(
    await reviewButtonFor(
      chapterWith({
        body_markdown: `${multiline}\n\nCosts pending. [Information needed: Confirm funding]`,
        gaps: [closedRecord],
      }),
    ),
  ).toBeUndefined();
  // An estimate alone does not hide it.
  expect(
    await reviewButtonFor(
      chapterWith({
        body_markdown: "The request is an estimated $2 million.",
        gaps: [caveat],
        caveat_count: 1,
      }),
    ),
  ).toBeDefined();
  // And the same chapter without markers shows it.
  expect(
    await reviewButtonFor(chapterWith({ body_markdown: "Budget is 10." })),
  ).toBeDefined();
});
