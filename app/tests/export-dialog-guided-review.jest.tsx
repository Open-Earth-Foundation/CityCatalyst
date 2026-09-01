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
import { configureStore } from "@reduxjs/toolkit";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { chapterValidationFindingKey } from "@/components/ConceptNoteWorkspace/chapter-validation";
import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  ConceptNoteChapterValidationResponse,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ValidateConceptNoteChapterRequest,
} from "@/util/types";

const validateChapter = jest.fn(
  (
    _request: ValidateConceptNoteChapterRequest,
  ): {
    unwrap: () => Promise<ConceptNoteChapterValidationResponse>;
  } => ({
    unwrap: async () => {
      throw new Error("Validation mock not configured");
    },
  }),
);

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let value = translations[key as keyof typeof translations] ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{{${name}}}`, String(replacement));
      }
      return value;
    },
  }),
}));

let ExportDialog: typeof import("@/components/ConceptNoteWorkspace/export-dialog").ExportDialog;
let api: typeof import("@/services/api").api;
let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof createTestStore>;

type ExportDialogProps = ComponentProps<typeof ExportDialog>;

function createTestStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });
}

function chapter(
  chapterId: string,
  title: string,
  position: number,
): ConceptNoteDraftChapter {
  return {
    body_markdown: `# ${title}\n\nDraft body`,
    chapter_id: chapterId,
    missing_information: ["Add required information"],
    position,
    required: true,
    revision_number: 1,
    status: "needs_review",
    template_section_id: `section-${position}`,
    title,
    user_locked: false,
    validation: null,
  };
}

function draft(): ConceptNoteDraftState {
  return {
    chapters: [
      chapter("chapter-target", "Proposed investment project", 0),
      chapter("chapter-related", "Use of EUCF support", 1),
    ],
    completed_chapters: 2,
    current_chapter_id: null,
    error_code: null,
    run_id: "run-1",
    status: "complete",
    total_chapters: 2,
  };
}

function draftWithChapterCount(chapterCount: number): ConceptNoteDraftState {
  const baseDraft = draft();
  const extraChapters = Array.from(
    { length: Math.max(0, chapterCount - baseDraft.chapters.length) },
    (_, index) =>
      chapter(
        `chapter-extra-${index + 1}`,
        `Additional chapter ${index + 1}`,
        index + baseDraft.chapters.length,
      ),
  );
  const chapters = [...baseDraft.chapters, ...extraChapters];
  return {
    ...baseDraft,
    chapters,
    completed_chapters: chapters.length,
    total_chapters: chapters.length,
  };
}

function validationFor(
  chapterId: string,
): ConceptNoteChapterValidationResponse {
  const conflict = {
    category: "cross_chapter_conflict",
    involved_chapter_ids: ["chapter-target", "chapter-related"],
    message: "The chapters define incompatible investment scope.",
    phase: "consistency" as const,
    severity: "blocking" as const,
    suggested_action: "Use one future eligible scope in both chapters.",
  };
  return {
    chapter_id: chapterId,
    checks: [
      { key: "template_constraints", status: "fail" },
      { key: "cross_chapter_consistency", status: "fail" },
    ],
    findings: [
      {
        category: "missing_information",
        involved_chapter_ids: [chapterId],
        message: "A required amount is missing.",
        phase: "completeness",
        severity: "blocking",
        suggested_action: "Add the confirmed EUR amount.",
      },
      {
        category: "evidence_gap",
        involved_chapter_ids: [chapterId],
        message: "A claim needs evidence.",
        phase: "evidence",
        severity: "warning",
        suggested_action: "Link the supporting report.",
      },
      conflict,
    ],
    is_stale: false,
    status: "incomplete",
    validated_at: "2026-08-28T12:00:00Z",
    validated_revision_number: 1,
  };
}

function draftWithSavedValidations({
  missingInformation = ["Add required information"],
  ready = false,
}: {
  missingInformation?: string[];
  ready?: boolean;
} = {}): ConceptNoteDraftState {
  const savedDraft = draft();
  return {
    ...savedDraft,
    chapters: savedDraft.chapters.map((draftChapter) => {
      const validation = validationFor(draftChapter.chapter_id);
      return {
        ...draftChapter,
        missing_information: missingInformation,
        validation: ready
          ? { ...validation, checks: [], findings: [], status: "ready" }
          : validation,
      };
    }),
  };
}

function button(label: string): HTMLButtonElement {
  const match = [...document.body.querySelectorAll("button")].find((item) =>
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

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderWithProviders(children: ReactNode): Promise<void> {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ChakraProvider value={appTheme}>{children}</ChakraProvider>
      </Provider>,
    );
  });
}

function defaultDialogProps(): ExportDialogProps {
  return {
    draft: draft(),
    draftError: false,
    hasApplicationTemplate: true,
    hasUploadedEvidence: false,
    lng: "en",
    noteName: "Kraków Tram",
    onAddInformation: jest.fn(),
    onOpenChange: jest.fn(),
    onRetryDraft: jest.fn(),
    onReviewComplete: jest.fn(async () => undefined),
    onReviewSetup: jest.fn(),
    open: true,
    runId: "run-1",
  };
}

async function renderDialog(
  overrides: Partial<ExportDialogProps> = {},
): Promise<void> {
  await renderWithProviders(
    <ExportDialog {...defaultDialogProps()} {...overrides} />,
  );
}

function validatedChapterIds(): string[] {
  return validateChapter.mock.calls.map(([request]) => request.chapterId);
}

function cloneForTest<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = cloneForTest;
  globalThis.fetch = jest.fn() as typeof fetch;
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ api } = await import("@/services/api"));
  jest
    .spyOn(api, "useValidateConceptNoteChapterMutation")
    .mockImplementation(() => [validateChapter] as never);
  ({ ExportDialog } =
    await import("@/components/ConceptNoteWorkspace/export-dialog"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  store = createTestStore();
  validateChapter.mockImplementation((request) => ({
    unwrap: async () => validationFor(request.chapterId),
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  validateChapter.mockReset();
});

describe("guided review before export", () => {
  it("runs no more than three chapter validations at once", async () => {
    const pending: Array<() => void> = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const onReviewComplete = jest.fn(async () => undefined);

    validateChapter.mockImplementation((request) => ({
      unwrap: () =>
        new Promise((resolve) => {
          activeRequests += 1;
          maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
          pending.push(() => {
            activeRequests -= 1;
            resolve(validationFor(request.chapterId));
          });
        }),
    }));

    await renderDialog({
      draft: draftWithChapterCount(5),
      onReviewComplete,
    });
    await settle();
    await settle();

    expect(validateChapter).toHaveBeenCalledTimes(3);
    expect(maxActiveRequests).toBe(3);

    await act(async () => {
      pending.shift()?.();
      await Promise.resolve();
    });
    expect(validateChapter).toHaveBeenCalledTimes(4);

    await act(async () => {
      pending.shift()?.();
      await Promise.resolve();
    });
    expect(validateChapter).toHaveBeenCalledTimes(5);
    expect(maxActiveRequests).toBe(3);

    await act(async () => {
      for (const complete of pending.splice(0)) {
        complete();
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle();

    expect(onReviewComplete).toHaveBeenCalledTimes(1);
  });

  it("waits for a delayed draft before starting the first review", async () => {
    await renderDialog({ draft: null });
    await settle();
    expect(validateChapter).not.toHaveBeenCalled();

    await renderDialog();
    await settle();

    expect(validatedChapterIds()).toEqual([
      "chapter-target",
      "chapter-related",
    ]);
    expect(document.body.textContent).toContain("Missing information");
  });

  it("opens current saved results without rerunning and offers an explicit rerun", async () => {
    await renderDialog({ draft: draftWithSavedValidations() });
    await settle();

    expect(validateChapter).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Saved review results");

    await click("Re-run review");
    await settle();

    expect(validatedChapterIds()).toEqual([
      "chapter-target",
      "chapter-related",
    ]);
  });

  it("revalidates a saved result whose revision no longer matches", async () => {
    const savedDraft = draftWithSavedValidations();
    savedDraft.chapters[1] = {
      ...savedDraft.chapters[1],
      revision_number: 2,
    };

    await renderDialog({ draft: savedDraft });
    await settle();

    expect(validateChapter).toHaveBeenCalledTimes(1);
    expect(validateChapter.mock.calls[0][0].chapterId).toBe("chapter-related");
  });

  it("keeps successful chapter results and retries only failed chapters", async () => {
    let relatedChapterFailed = false;
    validateChapter.mockImplementation((request) => ({
      unwrap: async () => {
        if (request.chapterId === "chapter-related" && !relatedChapterFailed) {
          relatedChapterFailed = true;
          throw Object.assign(new Error("Service unavailable"), {
            status: 503,
          });
        }
        return validationFor(request.chapterId);
      },
    }));

    await renderDialog();
    await settle();

    expect(document.body.textContent).toContain("A required amount is missing");
    expect(document.body.textContent).toContain("Use of EUCF support");
    expect(document.body.textContent).toContain(
      "The review service was temporarily unavailable.",
    );

    await click("Retry failed chapter");
    await settle();

    expect(validatedChapterIds()).toEqual([
      "chapter-target",
      "chapter-related",
      "chapter-related",
    ]);
    expect(document.body.textContent).not.toContain(
      "The review service was temporarily unavailable.",
    );
  });

  it("does not call a document ready while unanswered prompts will be omitted", async () => {
    await renderDialog({ draft: draftWithSavedValidations({ ready: true }) });
    await settle();
    await click("Continue to conflicts & logic");
    await click("Continue to decision");

    expect(document.body.textContent).toContain("Incomplete");
    expect(document.body.textContent).toContain("Export anyway");
  });

  it("renders a visible primary export label for a genuinely ready document", async () => {
    await renderDialog({
      draft: draftWithSavedValidations({ missingInformation: [], ready: true }),
    });
    await settle();
    await click("Continue to conflicts & logic");
    await click("Continue to decision");

    expect(document.body.textContent).toContain("Ready");
    expect(button("Continue to export").textContent).toContain(
      "Continue to export",
    );
  });

  it("runs from the dialog button flow and presents both review stages before export", async () => {
    const onAddInformation = jest.fn();
    const onOpenChange = jest.fn();
    const onReviewComplete = jest.fn(async () => undefined);

    await renderDialog({
      onAddInformation,
      onOpenChange,
      onReviewComplete,
    });
    await settle();

    expect(validatedChapterIds()).toEqual([
      "chapter-target",
      "chapter-related",
    ]);
    expect(document.body.textContent).toContain("Missing information");
    expect(document.body.textContent).toContain("Evidence to add");
    expect(document.body.textContent).toContain(
      "Add the confirmed EUR amount.",
    );

    await click("Continue to conflicts & logic");
    expect(document.body.textContent).toContain(
      "The chapters define incompatible investment scope.",
    );
    expect(document.body.textContent).toContain(
      "Related chapters: Use of EUCF support",
    );

    await click("Continue to decision");
    expect(document.body.textContent).toContain("Choose what happens next");
    expect(document.body.textContent).toContain("Fix missing information");
    expect(document.body.textContent).toContain("Review warnings (2)");
    expect(document.body.textContent).toContain(
      "Missing information must be resolved or confirmed before export",
    );
    expect(document.body.textContent).not.toContain(
      "Validation blockers remain unresolved in exported text",
    );
    expect(document.body.textContent).not.toContain(
      "Unanswered prompts are omitted from the file",
    );
    expect(document.body.textContent).toContain("Export anyway");

    await click("Export anyway");
    expect(document.body.textContent).toContain("Export the current draft");
    expect(document.body.textContent).toContain("Export DOCX");
    expect(button("Export DOCX").disabled).toBe(true);
  });

  it("passes the exact finding target when returning to the draft", async () => {
    const onAddInformation = jest.fn();

    await renderDialog({ onAddInformation });
    await settle();

    const finding = validationFor("chapter-target").findings[0];
    await click("Open chapter to fix");

    expect(onAddInformation).toHaveBeenCalledWith(
      "chapter-target",
      chapterValidationFindingKey("chapter-target", finding),
    );
  });

  it("blocks review when the application template is unavailable", async () => {
    const onOpenChange = jest.fn();
    const onReviewSetup = jest.fn();

    await renderDialog({
      hasApplicationTemplate: false,
      onOpenChange,
      onReviewSetup,
    });
    await settle();

    expect(validateChapter).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "The application template is no longer available",
    );

    await click("Review application setup");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onReviewSetup).toHaveBeenCalledTimes(1);
  });

  it("shows a retry action when loading the draft fails", async () => {
    const onRetryDraft = jest.fn();

    await renderDialog({ draft: null, draftError: true, onRetryDraft });
    await settle();

    expect(document.body.textContent).toContain(
      "The current draft could not be loaded.",
    );
    expect(validateChapter).not.toHaveBeenCalled();

    await click("Try again");
    expect(onRetryDraft).toHaveBeenCalledTimes(1);
  });
});
