/** @jest-environment jsdom */

import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { EditChange } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

let DraftDocumentPanel: typeof import("@/components/ConceptNoteWorkspace/draft-document-panel").DraftDocumentPanel;
let root: Root;
let container: HTMLDivElement;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom in CI lacks structuredClone.
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  HTMLElement.prototype.scrollTo = jest.fn();
  ({ DraftDocumentPanel } =
    await import("@/components/ConceptNoteWorkspace/draft-document-panel"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it.each([
  {
    state: "Ready without human confirmation",
    confirmedRevision: null,
    confirmedBody: null,
    visible: true,
  },
  {
    state: "current human confirmation",
    confirmedRevision: 2,
    confirmedBody: "Current budget.",
    visible: false,
  },
  {
    state: "confirmation of an older revision",
    confirmedRevision: 1,
    confirmedBody: "Earlier budget.",
    visible: true,
  },
  {
    state: "missing confirmed snapshot",
    confirmedRevision: 2,
    confirmedBody: null,
    visible: true,
  },
])(
  "offers confirmation for $state",
  async ({ confirmedRevision, confirmedBody, visible }) => {
    const chapter: ConceptNoteDraftChapter = {
      chapter_id: "chapter-confirmation",
      title: "Budget",
      template_section_id: "budget",
      position: 0,
      required: true,
      user_locked: false,
      status: "ready",
      body_markdown: "Current budget.",
      revision_number: 2,
      confirmed_body_markdown: confirmedBody,
      confirmed_revision_number: confirmedRevision,
      gaps: [],
      open_gap_count: 0,
      caveat_count: 0,
      validation: {
        status: "ready",
        is_stale: false,
        validated_revision_number: 2,
        validated_at: "2026-11-15T12:00:00Z",
        checks: [],
        findings: [],
      },
    };
    const onConfirmChapter = jest.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const props: ComponentProps<typeof DraftDocumentPanel> = {
      chapters: [chapter],
      lng: "en",
      noteName: "Budget application",
      focusFindingKey: null,
      isConfirmingChapter: false,
      onConfirmChapter,
      focus: {
        chapterElements: { current: {} },
        registerChapter: jest.fn(),
        focusedFinding: null,
        focusedFindingElement: { current: null },
        isChapterPanelOpen: true,
        usesSharedScroll: false,
        previewElement: { current: null },
        selectedChapterId: chapter.chapter_id,
        selectChapter: jest.fn(),
        toggleChapterPanel: jest.fn(),
      },
    };
    async function render(overrides: Partial<ConceptNoteDraftChapter> = {}) {
      await act(async () =>
        root.render(
          <ChakraProvider value={appTheme}>
            <DraftDocumentPanel
              {...props}
              chapters={[{ ...chapter, ...overrides }]}
            />
          </ChakraProvider>,
        ),
      );
    }
    const confirm = () =>
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes(translations["review-and-confirm"]),
      );
    await render();
    expect(Boolean(confirm())).toBe(visible);
    if (visible) {
      await act(async () => confirm()!.click());
      expect(onConfirmChapter).toHaveBeenCalledWith(chapter);
    }
    await render({ open_gap_count: 1 });
    expect(confirm()).toBeUndefined();
    await render({ body_markdown: null });
    expect(confirm()).toBeUndefined();
  },
);

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
  const chapterElements: { current: Record<string, HTMLDivElement | null> } = {
    current: {},
  };
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
      chapterElements,
      registerChapter: (id, element) => {
        chapterElements.current[id] = element;
      },
      previewElement: { current: null },
      focusedFindingElement: { current: null },
      isChapterPanelOpen: true,
      usesSharedScroll: false,
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  async function render(overrides: Partial<typeof props> = {}) {
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <DraftDocumentPanel {...props} {...overrides} />
        </ChakraProvider>,
      ),
    );
  }
  await render();
  expect(
    container.querySelector('[data-testid="focused-review-finding"]')
      ?.textContent,
  ).toContain("Check the total budget");
  const marker = () =>
    container.querySelector<HTMLButtonElement>(
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
    container.querySelector('[data-testid="focused-review-finding"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[data-testid="concept-note-inline-document"]')
      ?.textContent,
  ).toContain("20");
  expect(document.activeElement?.getAttribute("data-change-ids")).toContain(
    change.change_id,
  );
  await act(async () => {
    (
      container.querySelector(
        '[data-testid="concept-note-inline-accept"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onAcceptReviewChange).toHaveBeenCalledWith([change.change_id]);
  await act(async () => {
    const confirm = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Run chapter review"),
    );
    confirm?.click();
    (
      container.querySelector('[aria-current="location"]') as HTMLButtonElement
    ).click();
  });
  expect(onConfirmChapter).toHaveBeenCalledWith(chapter);

  const whole = {
    ...change,
    start: 0,
    before: "Intro unchanged.\n\nBudget is 10.\n\nEvidence remains unchanged.",
    after: "Intro unchanged.\n\nBudget is 20.\n\nEvidence remains unchanged.",
  };
  await render({
    chapters: [{ ...chapter, body_markdown: whole.before }],
    reviewChanges: [whole],
    editFocus: undefined,
  });
  expect(
    container.querySelectorAll(
      '[data-testid="concept-note-edit-previous-text"]',
    ),
  ).toHaveLength(1);
  expect(
    container.querySelector('[data-testid="concept-note-edit-previous-text"]')
      ?.textContent,
  ).toBe("Budget is 10.");
  expect(
    container.querySelector('[data-testid="concept-note-edit-proposed-text"]')
      ?.textContent,
  ).toBe("Budget is 20.");
  expect(
    [
      ...container.querySelectorAll(
        '[data-testid="concept-note-edit-unchanged-text"]',
      ),
    ].map((node) => node.textContent),
  ).toEqual(["Intro unchanged.", "Evidence remains unchanged."]);
  await act(async () =>
    (
      container.querySelector(
        '[data-testid="concept-note-inline-accept"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(onAcceptReviewChange).toHaveBeenLastCalledWith([whole.change_id]);
  expect(whole.before).toContain("Intro unchanged.");

  const appended = {
    ...whole,
    start: 6,
    before: ".",
    after: ". Added sentence.",
  };
  await render({
    chapters: [{ ...chapter, body_markdown: "Budget." }],
    reviewChanges: [appended],
    editFocus: undefined,
  });
  expect(
    container.querySelector('[data-testid="concept-note-edit-previous-text"]'),
  ).toBeNull();
  expect(
    container.querySelector('[data-testid="concept-note-edit-proposed-text"]')
      ?.textContent,
  ).toBe(" Added sentence.");
  await act(async () =>
    (
      container.querySelector(
        '[data-testid="concept-note-inline-accept"]',
      ) as HTMLButtonElement
    ).click(),
  );
  expect(onAcceptReviewChange).toHaveBeenLastCalledWith([appended.change_id]);

  const dated = {
    ...chapter,
    body_markdown: "Award [Information needed: Confirm award date]",
    open_gap_count: 1,
    gaps: [
      {
        gap_id: "date-gap",
        field_key: "award_date",
        question: "Confirm award date",
        why_asking: "Required by the template",
        severity: "critical" as const,
        state: "open" as const,
        suggestions: [],
        source_refs: [],
        version: 1,
        resolution: null,
        created_at: "2026-11-15",
        updated_at: "2026-11-15",
      },
    ],
  };
  const onAnswerGap = jest.fn();
  await render({
    chapters: [dated],
    canonicalPointKeys: ["award_date"],
    onAnswerGap,
  });
  await act(async () => marker().click());
  expect(onAnswerGap).toHaveBeenCalledWith(
    dated,
    expect.objectContaining({
      gap: expect.objectContaining({ field_key: "award_date" }),
    }),
  );
  expect(marker().getAttribute("aria-expanded")).not.toBe("true");
  expect(onFocusedChapterChange).toHaveBeenCalledWith(chapter.chapter_id);
});
