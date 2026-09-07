/** @jest-environment jsdom */
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, createElement, type ComponentProps } from "react";
import type { Root } from "react-dom/client";

import type {
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ConceptNoteGap,
} from "@/util/types";
import { getConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import {
  chapterId,
  draftChapter,
  cleanup,
  mount,
  prepareDom,
  runId,
  proposal,
  t,
} from "./cnb-edit-ui-helpers";

type Props = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/draft-tab").DraftTab
>;
let Draft: typeof import("@/components/ConceptNoteWorkspace/draft-tab").DraftTab;
let root: Root | undefined;
let container: HTMLDivElement;

prepareDom();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

function chapter(
  overrides: Partial<ConceptNoteDraftChapter> = {},
): ConceptNoteDraftChapter {
  return draftChapter({
    body_markdown:
      "# SUMMARY\n\nA flood-resilient park.\n\n[Evidence](https://example.test/evidence)",
    confirmed_body_markdown: "A flood-resilient park.",
    ...overrides,
  });
}

function draft(
  chapters = [chapter()],
  overrides: Partial<ConceptNoteDraftState> = {},
): ConceptNoteDraftState {
  return {
    run_id: runId,
    status: "complete",
    chapters,
    total_chapters: chapters.length,
    completed_chapters: chapters.length,
    current_chapter_id: null,
    focused_gap_id: null,
    error_code: null,
    ...overrides,
  };
}
function props(overrides: Partial<Props> = {}): Props {
  return {
    applicationContext: {
      run_id: runId,
      city_id: "city",
      funder: { id: "funder", name: "Funder" },
      opportunity: { id: "opportunity", name: "Programme" },
      template: {
        id: "template",
        name: "Template",
        output_format: null,
        required_fields: [],
        chapter_schema: [
          { chapter_ref: "summary", title: "Summary" },
          { chapter_ref: "delivery", title: "Delivery" },
        ],
      },
      included_sources: {
        city: true,
        project: false,
        ghgi: false,
        ccra: false,
        hiap: false,
      },
    },
    applicationContextFailed: false,
    applicationContextLoading: false,
    bundle: getConceptNoteBundleProgress({
      context_bundle: {
        status: "ready",
        document_grounding: "uploaded_evidence",
        source_counts: { ready: 2 },
      },
    }),
    canStartDrafting: true,
    draft: draft(),
    draftError: null,
    isDraftRunning: false,
    isConfirmingChapter: false,
    isRetrying: false,
    isStartingDraft: false,
    lng: "en",
    noteName: "Owned note",
    onConfirmChapter: jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined),
    onOpenContext: jest.fn(),
    onReviewChapterGaps: jest.fn(),
    onRetry: jest.fn(),
    onStartDrafting: jest.fn(),
    onFocusedChapterChange: jest.fn(),
    editFocus: null,
    ...overrides,
  };
}
const gap: ConceptNoteGap = {
  gap_id: "gap-one",
  field_key: "budget",
  question: "What is the budget?",
  why_asking: "Budget needs evidence",
  severity: "critical",
  state: "open",
  suggestions: [],
  source_refs: [],
  version: 1,
  resolution: null,
  created_at: "2026-08-30T12:00:00Z",
  updated_at: "2026-08-30T12:00:00Z",
};

beforeAll(async () => {
  ({ DraftTab: Draft } =
    await import("@/components/ConceptNoteWorkspace/draft-tab"));
});
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: jest.fn(),
  });
});
afterEach(async () => {
  await cleanup(root);
  root = undefined;
  jest.restoreAllMocks();
});
async function render(values: Props) {
  const result = await mount(createElement(Draft, values), true);
  root = result.root;
  container = result.container;
}
async function click(element: HTMLButtonElement) {
  await act(async () => element.click());
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find(
    (element) =>
      element.textContent?.trim() === text ||
      element.getAttribute("aria-label") === text,
  );
  if (!found) throw new Error(`Expected button ${text}`);
  return found;
}
async function rerender(values: Props) {
  const { ChakraProvider } = await import("@chakra-ui/react");
  const { appTheme } = await import("@/lib/theme/recipes/app-theme");
  await act(async () =>
    root!.render(
      createElement(
        ChakraProvider,
        { value: appTheme },
        createElement(Draft, values),
      ),
    ),
  );
}

it("renders persisted markdown without duplicating its chapter heading or injecting raw HTML", async () => {
  const values = props({
    draft: draft([
      chapter({
        body_markdown:
          "# SUMMARY\n\nA park.\n\n[Evidence](https://example.test/evidence)\n\n<script>unexpected()</script>",
      }),
    ]),
  });
  await render(values);
  const preview = container.querySelector(
    '[data-testid="concept-note-draft-preview"]',
  )!;
  expect(preview.textContent).toContain("A park.");
  expect(preview.querySelector("h1")).toBeNull();
  expect(preview.querySelector("script")).toBeNull();
  expect(preview.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.test/evidence",
  );
  expect(container.textContent).not.toContain(t("draft-progress"));
});

it.each([
  [null, "context-starting-title"],
  ["building", "building-source-context"],
  ["failed", "context-needs-attention"],
  ["ready", "source-context-assembled"],
] as const)(
  "represents source readiness %s before drafting",
  async (status, title) => {
    const values = props({
      draft: null,
      bundle: getConceptNoteBundleProgress({
        context_bundle: {
          status,
          document_grounding: "uploaded_evidence",
          source_counts: { ready: 2 },
        },
      }),
    });
    await render(values);
    expect(container.textContent).toContain(t(title));
    expect(container.textContent).toContain(t("draft-status-not-started"));
    expect(container.textContent).toContain(t("draft-empty-state"));
    expect(
      container.querySelector('[data-testid="concept-note-draft-preview"]'),
    ).toBeNull();
    if (status !== "building" && status !== "failed") {
      await click(button(t("review-context")));
      await click(button(t("start-drafting")));
      expect(values.onOpenContext).toHaveBeenCalledTimes(1);
      expect(values.onStartDrafting).toHaveBeenCalledTimes(1);
    } else {
      expect(
        Array.from(container.querySelectorAll("button")).filter(
          (element) => element.textContent?.trim() === t("start-drafting"),
        ),
      ).toHaveLength(0);
    }
  },
);

it("navigates and collapses sections without scrolling the page or another pane", async () => {
  const target = chapter({
    chapter_id: "chapter-two",
    title: "Delivery",
    position: 1,
    status: "needs_review",
    open_gap_count: 1,
    gaps: [gap],
    body_markdown: "Delivery text.",
  });
  const values = props({ draft: draft([chapter(), target]) });
  await render(values);
  const preview = container.querySelector<HTMLElement>(
    '[data-testid="concept-note-draft-preview"]',
  )!;
  const targetElement = container.querySelector<HTMLElement>(
    '[data-chapter-id="chapter-two"]',
  )!;
  jest
    .spyOn(preview, "getBoundingClientRect")
    .mockReturnValue({ top: 100 } as DOMRect);
  jest
    .spyOn(targetElement, "getBoundingClientRect")
    .mockReturnValue({ top: 500 } as DOMRect);
  preview.scrollTop = 10;
  await click(button(t("jump-to-chapter", { chapter: "Delivery" })));
  expect(preview.scrollTo).toHaveBeenCalledWith({
    top: 362,
    behavior: "smooth",
  });
  expect(values.onReviewChapterGaps).toHaveBeenCalledWith(target);
  expect(values.onFocusedChapterChange).toHaveBeenCalledWith("chapter-two");
  expect(
    button(t("jump-to-chapter", { chapter: "Delivery" })).getAttribute(
      "aria-current",
    ),
  ).toBe("location");
  const toggle = button(t("collapse-draft-sections"));
  await click(toggle);
  expect(
    container
      .querySelector("#concept-note-sections-list")
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
  await click(button(t("expand-draft-sections")));
  expect(
    container
      .querySelector("#concept-note-sections-list")
      ?.getAttribute("aria-hidden"),
  ).toBe("false");
});

it("confirms only a draft chapter with no blocking gaps or active regeneration", async () => {
  const candidate = chapter({
    status: "draft",
    confirmed_revision_number: null,
  });
  const busy = chapter({
    chapter_id: "processing",
    title: "Processing",
    position: 1,
    status: "draft",
    regeneration_status: "processing",
  });
  const blocked = chapter({
    chapter_id: "blocked",
    title: "Blocked",
    position: 2,
    status: "draft",
    open_gap_count: 1,
    gaps: [gap],
  });
  const values = props({ draft: draft([candidate, busy, blocked]) });
  await render(values);
  const confirms = Array.from(container.querySelectorAll("button")).filter(
    (element) => element.textContent?.trim() === t("review-and-confirm"),
  );
  expect(confirms).toHaveLength(1);
  await click(confirms[0]);
  expect(values.onConfirmChapter).toHaveBeenCalledWith(candidate);
  expect(container.textContent).toContain(t("chapter-regenerating"));
});

it("disables duplicate chapter confirmation while a mutation is pending", async () => {
  const values = props({
    draft: draft([chapter({ status: "draft" })]),
    isConfirmingChapter: true,
  });
  await render(values);
  const confirm = button(t("review-and-confirm"));
  expect(confirm.disabled).toBe(true);
  await click(confirm);
  expect(values.onConfirmChapter).not.toHaveBeenCalled();
});

it("keeps failed/empty chapters and visible caveats inspectable", async () => {
  await render(
    props({
      draft: draft([
        chapter({
          status: "empty",
          body_markdown: null,
          caveat_count: 1,
          regeneration_status: "failed",
          regeneration_error: "fixture",
        }),
      ]),
    }),
  );
  expect(container.textContent).toContain(t("chapter-awaiting-copy"));
  expect(container.textContent).toContain(t("chapter-regeneration-failed"));
  expect(container.textContent).toContain(t("chapter-caveats", { count: 1 }));
});

it("redlines regenerated chapters with compact read-only information markers", async () => {
  const pending = chapter({
    status: "needs_review",
    revision_number: 2,
    proposed_revision_number: 2,
    confirmed_body_markdown:
      "# Summary\n\nConfirmed wording. [Information needed: What is the budget?]",
    body_markdown:
      "# Summary\n\nProposed wording. [Information needed: What is the budget?]",
    gaps: [gap],
    open_gap_count: 1,
  });
  const values = props({ draft: draft([pending]) });
  await render(values);
  expect(container.querySelector("del")?.textContent).toBe("Confirm");
  expect(container.querySelector("ins")?.textContent).toBe("Propos");
  expect(container.textContent).not.toContain("[Information needed:");
  const marker = button("Information needed: What is the budget?");
  expect(marker.getAttribute("data-review-decoration")).toBe("true");
  await click(marker);
  expect(values.onReviewChapterGaps).not.toHaveBeenCalled();
  expect(container.querySelector("[data-current-chapter-id]")).toBeNull();
});

it("opens review even when a legacy marker has no exact structured gap match", async () => {
  const legacy = chapter({
    body_markdown: "Legacy [Information needed: Explain old evidence]",
  });
  const values = props({ draft: draft([legacy]) });
  await render(values);
  await click(button("Information needed: Explain old evidence"));
  expect(values.onReviewChapterGaps).toHaveBeenCalledWith(legacy, undefined);
});

it("uses the same compact control for formatted messages in normal preview", async () => {
  const current = chapter({
    body_markdown:
      "Current text. [Information needed: Confirm the **budget**.]",
  });
  const values = props({ draft: draft([current]) });
  await render(values);
  expect(container.textContent).not.toContain("[Information needed:");
  await click(button("Information needed: Confirm the **budget**."));
  expect(values.onReviewChapterGaps).toHaveBeenCalledWith(current, undefined);
  expect(current.body_markdown).toBe(
    "Current text. [Information needed: Confirm the **budget**.]",
  );
});

it("scrolls and focuses the exact affected passage rather than only its chapter", async () => {
  const change = {
    ...proposal.changes[0],
    before: "park",
    after: "gardens",
    start: 6,
  };
  const values = props({
    draft: draft([chapter({ body_markdown: "Green park." })]),
    reviewChanges: [change],
    activeChangeId: change.change_id,
    isReviewing: true,
    editFocus: {
      chapterId,
      changeId: change.change_id,
      requestId: "review",
      focus: true,
    },
  });
  await render(values);
  await act(
    async () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(document.activeElement?.getAttribute("data-change-id")).toBe(
    change.change_id,
  );
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
  expect(
    container.querySelector('[data-testid="concept-note-review-toolbar"]'),
  ).toBeNull();
});
