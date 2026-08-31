/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftState } from "@/util/types";

const translations: Record<string, string> = {
  "draft-preview-document-title": "{{name}} — Concept note",
  "draft-sections": "Sections",
  "hide-chapter-panel": "Hide chapter panel",
  "jump-to-chapter": "Jump to {{chapter}}",
  "show-chapter-panel": "Show chapter panel",
  "validation-group-missing-information": "Missing information",
  "validation-suggested-action": "Next step: {{action}}",
  "workspace-ask-clima": "Ask Clima to fix",
  "workspace-dismiss-finding": "Dismiss",
  "workspace-dismissed-local-note": "Dismissed locally",
  "workspace-draft-prompts": "Draft prompts",
  "workspace-missing-information": "Missing information",
  "workspace-missing-information-description": "Saved with this chapter",
  "workspace-resolve-finding": "Resolve",
  "workspace-review-findings": "Review findings",
  "workspace-show-dismissed": "Show {{count}} dismissed",
  "review-blocking": "Blocking",
};

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let value = translations[key] ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{{${name}}}`, String(replacement));
      }
      return value;
    },
  }),
}));

jest.unstable_mockModule("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.unstable_mockModule("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

let DraftTab: typeof import("@/components/ConceptNoteWorkspace/draft-tab").DraftTab;
let container: HTMLDivElement;
let root: Root;

const bundle: ConceptNoteBundleProgress = {
  availableContext: {
    ccra: false,
    city: true,
    ghgi: true,
    hiap: false,
    project: true,
    uploadedDocuments: false,
  },
  documentGrounding: "none",
  failedSources: 0,
  ghgiStatus: "ready",
  hiapStatus: null,
  missingContext: [],
  processingSources: 0,
  queuedSources: 0,
  readySources: 3,
  retryable: false,
  status: "ready",
};

const draft: ConceptNoteDraftState = {
  chapters: [
    {
      body_markdown: "# Project summary\n\nDraft body",
      chapter_id: "chapter-1",
      missing_information: [],
      position: 0,
      required: true,
      revision_number: 1,
      status: "ready",
      template_section_id: "project-summary",
      title: "Project summary",
      user_locked: false,
      validation: null,
    },
  ],
  completed_chapters: 1,
  current_chapter_id: "chapter-1",
  error_code: null,
  run_id: "run-1",
  status: "complete",
  total_chapters: 1,
};

function button(label: string): HTMLButtonElement {
  const match = [...document.body.querySelectorAll("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.includes(label),
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return match;
}

async function click(label: string): Promise<void> {
  await act(async () => {
    button(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function cloneForTest<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = cloneForTest;
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  HTMLElement.prototype.scrollTo = jest.fn();
  ({ DraftTab } = await import("@/components/ConceptNoteWorkspace/draft-tab"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Concept Note draft chapter panel", () => {
  it("hides and restores the chapter panel with one click", async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <DraftTab
            applicationContext={null}
            applicationContextFailed={false}
            applicationContextLoading={false}
            bundle={bundle}
            canStartDrafting
            draft={draft}
            draftError={null}
            focusChapterId={null}
            focusFindingKey={null}
            isDraftRunning={false}
            isRetrying={false}
            isStartingDraft={false}
            lng="en"
            noteName="Kraków Tram"
            onAskClima={jest.fn()}
            onClearFindingFocus={jest.fn()}
            onOpenContext={jest.fn()}
            onRetry={jest.fn()}
            onResolveChapter={jest.fn()}
            onStartDrafting={jest.fn()}
            resolvingChapterId={null}
          />
        </ChakraProvider>,
      );
    });

    expect(button("Hide chapter panel").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(button("Jump to Project summary")).toBeTruthy();
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      false,
    );

    await click("Hide chapter panel");
    expect(button("Show chapter panel").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      true,
    );

    await click("Show chapter panel");
    expect(button("Jump to Project summary")).toBeTruthy();
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      false,
    );
  });

  it("keeps saved review findings actionable in the draft", async () => {
    const finding = {
      category: "missing_information",
      involved_chapter_ids: ["chapter-1"],
      message: "The confirmed co-financing amount is missing.",
      phase: "completeness" as const,
      severity: "blocking" as const,
      suggested_action: "Add the confirmed amount and source.",
    };
    const reviewDraft: ConceptNoteDraftState = {
      ...draft,
      chapters: [
        {
          ...draft.chapters[0],
          missing_information: ["Confirm the co-financing amount."],
          validation: {
            checks: [],
            findings: [finding],
            is_stale: false,
            status: "incomplete",
            validated_at: "2026-08-31T10:00:00Z",
            validated_revision_number: 1,
          },
        },
      ],
    };
    const onAskClima = jest.fn();
    const onResolveChapter = jest.fn();

    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <DraftTab
            applicationContext={null}
            applicationContextFailed={false}
            applicationContextLoading={false}
            bundle={bundle}
            canStartDrafting
            draft={reviewDraft}
            draftError={null}
            focusChapterId="chapter-1"
            focusFindingKey={null}
            isDraftRunning={false}
            isRetrying={false}
            isStartingDraft={false}
            lng="en"
            noteName="Kraków Tram"
            onAskClima={onAskClima}
            onClearFindingFocus={jest.fn()}
            onOpenContext={jest.fn()}
            onRetry={jest.fn()}
            onResolveChapter={onResolveChapter}
            onStartDrafting={jest.fn()}
            resolvingChapterId={null}
          />
        </ChakraProvider>,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Draft prompts");
    expect(document.body.textContent).toContain("Review findings");
    expect(document.body.textContent).toContain(finding.message);

    await click("Resolve");
    expect(onResolveChapter).toHaveBeenCalledWith("chapter-1");

    await click("Ask Clima to fix");
    expect(onAskClima).toHaveBeenCalledWith(reviewDraft.chapters[0], finding);

    await click("Dismiss");
    expect(document.body.textContent).not.toContain(finding.message);
    expect(document.body.textContent).toContain("Show 1 dismissed");

    await click("Show 1 dismissed");
    expect(document.body.textContent).toContain(finding.message);
  });
});
