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
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  ConceptNoteChapterValidationResponse,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ValidateConceptNoteChapterRequest,
} from "@/util/types";

const validateChapter = jest.fn(
  (_request: ValidateConceptNoteChapterRequest) => ({
    unwrap: async (): Promise<ConceptNoteChapterValidationResponse> => {
      throw new Error("Validation mock not configured");
    },
  }),
);

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values: Record<string, string | number> = {}) => {
      const pluralKey = `${key}_${values.count === 1 ? "one" : "other"}`;
      let text =
        translations[pluralKey as keyof typeof translations] ??
        translations[key as keyof typeof translations] ??
        key;
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{{${name}}}`, String(value));
      }
      return text;
    },
  }),
}));

let ExportDialog: typeof import("@/components/ConceptNoteWorkspace/export-dialog").ExportDialog;
let api: typeof import("@/services/api").api;
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof createStore>;

function createStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
}

function chapter(index: number): ConceptNoteDraftChapter {
  return {
    body_markdown: `# Chapter ${index + 1}\n\nDraft body`,
    chapter_id: `chapter-${index + 1}`,
    missing_information: ["Add required information"],
    position: index,
    required: true,
    revision_number: 1,
    status: "needs_review",
    template_section_id: `section-${index + 1}`,
    title: `Chapter ${index + 1}`,
    user_locked: false,
    validation: null,
  };
}

function result(chapterId: string): ConceptNoteChapterValidationResponse {
  return {
    chapter_id: chapterId,
    checks: [{ key: "template_constraints", status: "fail" }],
    findings: [
      {
        category: "missing_information",
        involved_chapter_ids: [chapterId],
        message: "A required amount is missing.",
        phase: "completeness",
        severity: "blocking",
        suggested_action: "Add the confirmed amount.",
      },
    ],
    is_stale: false,
    status: "incomplete",
    validated_at: "2026-08-28T12:00:00Z",
    validated_revision_number: 1,
  };
}

function draft(count = 2, saved = false): ConceptNoteDraftState {
  const chapters = Array.from({ length: count }, (_, index) => {
    const item = chapter(index);
    return saved ? { ...item, validation: result(item.chapter_id) } : item;
  });
  return {
    chapters,
    completed_chapters: count,
    current_chapter_id: null,
    error_code: null,
    run_id: "run-1",
    status: "complete",
    total_chapters: count,
  };
}

function defaultProps(): ComponentProps<typeof ExportDialog> {
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
  overrides: Partial<ComponentProps<typeof ExportDialog>> = {},
) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ChakraProvider value={appTheme}>
          <ExportDialog {...defaultProps()} {...overrides} />
        </ChakraProvider>
      </Provider>,
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise(requestAnimationFrame);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(label: string) {
  const target = [...document.body.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(label),
  );
  if (!(target instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  await act(async () => {
    target.click();
  });
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
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
  store = createStore();
  validateChapter.mockImplementation((request) => ({
    unwrap: async () => result(request.chapterId),
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  validateChapter.mockReset();
});

describe("guided review before export", () => {
  it("limits validation concurrency to three chapters", async () => {
    const pending: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    validateChapter.mockImplementation((request) => ({
      unwrap: () =>
        new Promise((resolve) => {
          active += 1;
          maximum = Math.max(maximum, active);
          pending.push(() => {
            active -= 1;
            resolve(result(request.chapterId));
          });
        }),
    }));

    await renderDialog({ draft: draft(5) });
    await settle();
    await settle();
    expect(validateChapter).toHaveBeenCalledTimes(3);

    await act(async () => pending.shift()?.());
    await act(async () => pending.shift()?.());
    expect(validateChapter).toHaveBeenCalledTimes(5);
    expect(maximum).toBe(3);

    await act(async () => pending.splice(0).forEach((complete) => complete()));
  });

  it("reuses current saved results but refreshes a stale chapter", async () => {
    const savedDraft = draft(2, true);
    savedDraft.chapters[1] = { ...savedDraft.chapters[1], revision_number: 2 };

    await renderDialog({ draft: savedDraft });
    await settle();

    expect(validateChapter).toHaveBeenCalledTimes(1);
    expect(validateChapter.mock.calls[0][0].chapterId).toBe("chapter-2");
    expect(document.body.textContent).toContain("Saved review results");
  });

  it("retries only the chapter that failed", async () => {
    let failed = false;
    validateChapter.mockImplementation((request) => ({
      unwrap: async () => {
        if (request.chapterId === "chapter-2" && !failed) {
          failed = true;
          throw Object.assign(new Error("Unavailable"), { status: 503 });
        }
        return result(request.chapterId);
      },
    }));

    await renderDialog();
    await settle();
    await settle();
    await click("Retry failed chapter");
    await settle();

    expect(
      validateChapter.mock.calls.map(([request]) => request.chapterId),
    ).toEqual(["chapter-1", "chapter-2", "chapter-2"]);
  });

  it("shows missing information before requiring an explicit export decision", async () => {
    await renderDialog();
    await settle();

    expect(document.body.textContent).toContain("Missing information");
    await click("Continue to conflicts & logic");
    await click("Continue to decision");
    expect(document.body.textContent).toContain("Export anyway");
  });
});
