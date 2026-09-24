/** @jest-environment jsdom */

import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { DocumentReviewFinding } from "@/components/ConceptNoteWorkspace/chapter-validation";
import type { FailedChapterReview } from "@/components/ConceptNoteWorkspace/use-guided-review";
import type { ConceptNoteDraftChapter } from "@/util/types";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const plural =
        options?.count === undefined
          ? key
          : `${key}_${options.count === 1 ? "one" : "other"}`;
      const text: string =
        translations[plural as keyof typeof translations] ??
        translations[key as keyof typeof translations] ??
        key;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ""),
      );
    },
  }),
}));

let summary: typeof import("@/components/ConceptNoteWorkspace/guided-review-summary");
let panels: typeof import("@/components/ConceptNoteWorkspace/guided-review-panels");
let root: Root;
let container: HTMLDivElement;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom in CI lacks structuredClone.
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  summary =
    await import("@/components/ConceptNoteWorkspace/guided-review-summary");
  panels =
    await import("@/components/ConceptNoteWorkspace/guided-review-panels");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<ChakraProvider value={appTheme}>{node}</ChakraProvider>),
  );
}

function chapter(id: string): ConceptNoteDraftChapter {
  return {
    chapter_id: id,
    title: `Chapter ${id}`,
    template_section_id: id,
    position: 0,
    required: true,
    user_locked: false,
    status: "draft",
    body_markdown: "Body",
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    gaps: [],
    open_gap_count: 0,
    caveat_count: 0,
  };
}

const entry: DocumentReviewFinding = {
  chapterId: "a",
  chapterTitle: "Chapter a",
  finding: {
    category: "missing_information",
    evidence: [],
    involved_chapter_ids: ["a"],
    message: "A required date is missing.",
    phase: "completeness",
    severity: "blocking",
    suggested_action: "Add the date.",
  },
};

const emptyKey = "review-no-missing-information";

it.each([
  [0, [], true, false],
  [12, [], false, true],
  [2, [entry], false, true],
] as const)(
  "shows a positive empty state only when every chapter was checked (unchecked=%s)",
  async (uncheckedCount, entries, positive, unchecked) => {
    await render(
      <summary.ReviewFindingList
        chapterTitles={{}}
        emptyKey={emptyKey}
        entries={[...entries]}
        lng="en"
        onOpenFinding={() => {}}
        uncheckedCount={uncheckedCount}
      />,
    );
    expect(container.textContent?.includes(translations[emptyKey])).toBe(
      positive,
    );
    expect(
      Boolean(
        container.querySelector(
          '[data-testid="concept-note-review-unchecked"]',
        ),
      ),
    ).toBe(unchecked);
  },
);

it("offers application setup instead of retry for invalid templates", async () => {
  const onRetryFailed = jest.fn();
  const onReviewSetup = jest.fn();
  const failures = (kind: FailedChapterReview["errorKind"], ids: string[]) =>
    ids.map((id) => ({ chapter: chapter(id), errorKind: kind }));
  await render(
    <summary.SavedReviewSummary
      failedChapters={failures("template_invalid", ["a", "b"])}
      lastValidatedAt={null}
      lng="en"
      reviewedCount={0}
      onRerun={() => {}}
      onRetryFailed={onRetryFailed}
      onReviewSetup={onReviewSetup}
    />,
  );
  expect(
    container.querySelector(
      '[data-testid="concept-note-review-template-invalid"]',
    )?.textContent,
  ).toContain("application template must be fixed");
  const buttons = [...container.querySelectorAll("button")].map(
    (button) => button.textContent,
  );
  expect(buttons).toContain(translations["review-application-setup"]);
  expect(buttons.some((text) => text?.startsWith("Retry"))).toBe(false);

  await act(async () => root.unmount());
  container.remove();
  await render(
    <summary.SavedReviewSummary
      failedChapters={[
        ...failures("template_invalid", ["a"]),
        ...failures("service_unavailable", ["b", "c"]),
      ]}
      lastValidatedAt={null}
      lng="en"
      reviewedCount={0}
      onRerun={() => {}}
      onRetryFailed={onRetryFailed}
      onReviewSetup={onReviewSetup}
    />,
  );
  expect(container.textContent).toContain("Retry 2 failed chapters");
});

it.each(["missing_information", "conflicts_logic"] as const)(
  "never summarises an incomplete %s step as found 0 items",
  async (mode) => {
    const review = {
      blockingCount: 0,
      evidenceCount: 0,
      groups: { missing_information: [], conflicts_logic: [], evidence: [] },
      status: "incomplete" as const,
      templateFailureCount: 0,
      warningCount: 0,
    };
    const panel = (uncheckedCount: number) => (
      <panels.GuidedReviewFindingsPanel
        chapterTitles={{}}
        lng="en"
        mode={mode}
        onNext={() => {}}
        onOpenFinding={() => {}}
        review={review}
        uncheckedCount={uncheckedCount}
      />
    );
    await render(panel(12));
    expect(container.textContent).toContain(
      "Results are incomplete: 12 chapters could not be checked",
    );
    expect(container.textContent).not.toMatch(/found 0/);

    await act(async () => root.unmount());
    container.remove();
    await render(panel(0));
    expect(container.textContent).toMatch(/found 0/);
    expect(container.textContent).not.toContain("Results are incomplete");
  },
);
