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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  ConceptNoteChapterValidationResponse,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ValidateConceptNoteChapterRequest,
} from "@/util/types";

const translations: Record<string, string> = {
  cancel: "Cancel",
  close: "Close",
  "docx-description": "Editable document",
  "export-failed": "Export failed",
  "export-format": "Export {{format}}",
  "guided-review-description": "Review description",
  "guided-review-failed": "Review failed",
  "guided-review-failed-description": "Try again",
  "guided-review-progress": "Chapter {{current}} of {{total}} · {{chapter}}",
  "guided-review-running": "Reviewing the full document",
  "guided-review-running-description":
    "Completeness first, consistency second.",
  "guided-review-steps": "Review steps",
  "guided-review-title": "Review before export",
  "missing-information-export-confirmation":
    "I understand unresolved information is omitted.",
  "pdf-description": "Review copy",
  "review-accept": "Accept review",
  "review-action-label": "Recommended action:",
  "review-add-information": "Add information",
  "review-back-conflicts": "Back to conflicts & logic",
  "review-back-decision": "Back to decision",
  "review-back-missing": "Back to missing information",
  "review-blocking": "Blocking",
  "review-blocking-items": "Blocking items",
  "review-conflicts-description":
    "The consistency review found {{count}} issues.",
  "review-conflicts-title": "Conflicts & logic",
  "review-continue-export": "Continue to export",
  "review-decision-description": "Choose what happens next.",
  "review-decision-title": "Choose what happens next",
  "review-document-status": "Document review status",
  "review-evidence-description": "{{count}} evidence warnings.",
  "review-evidence-title": "Evidence to add",
  "review-export-as-is": "Export as is",
  "review-export-description": "Choose a format.",
  "review-export-title": "Export the current draft",
  "review-missing-description":
    "The completeness review found {{count}} items.",
  "review-missing-title": "Missing information",
  "review-next-conflicts": "Continue to conflicts & logic",
  "review-next-decision": "Continue to decision",
  "review-no-conflicts": "No conflicts",
  "review-no-evidence-warnings": "No evidence warnings",
  "review-no-missing-information": "No missing information",
  "review-step-conflicts-logic": "Conflicts & logic",
  "review-step-decision": "Decide & export",
  "review-step-missing-information": "Missing information",
  "review-step-number": "Step {{number}}",
  "review-template-failures": "{{count}} chapters fail the template.",
  "review-warning": "Review",
  "review-warning-items": "Warnings",
  "source-context-ready": "Evidence available",
  "source-context-ready-export": "Evidence is linked.",
  "source-context-recommended": "Evidence missing",
  "source-context-recommended-export": "Add a source when possible.",
  "try-again": "Try again",
  "validation-related-chapters": "Related chapters: {{chapters}}",
  "validation-status-incomplete": "Incomplete",
  "validation-status-needs-review": "Needs review",
  "validation-status-ready": "Ready",
};

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
      let value = translations[key] ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{{${name}}}`, String(replacement));
      }
      return value;
    },
  }),
}));

jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useValidateConceptNoteChapterMutation: () => [validateChapter],
  },
}));

let ExportDialog: typeof import("@/components/ConceptNoteWorkspace/export-dialog").ExportDialog;
let container: HTMLDivElement;
let root: Root;

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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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
  it("waits for a delayed draft before starting the first review", async () => {
    const props = {
      hasUploadedEvidence: false,
      lng: "en",
      noteName: "Kraków Tram",
      onAddInformation: jest.fn(),
      onOpenChange: jest.fn(),
      onReviewComplete: jest.fn(async () => undefined),
      open: true,
      runId: "run-1",
    };

    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <ExportDialog {...props} draft={null} />
        </ChakraProvider>,
      );
    });
    await settle();
    expect(validateChapter).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <ExportDialog {...props} draft={draft()} />
        </ChakraProvider>,
      );
    });
    await settle();

    expect(
      validateChapter.mock.calls.map(([request]) => request.chapterId),
    ).toEqual(["chapter-target", "chapter-related"]);
    expect(document.body.textContent).toContain("Missing information");
  });

  it("runs from the dialog button flow and presents both review stages before export", async () => {
    const onAddInformation = jest.fn();
    const onOpenChange = jest.fn();
    const onReviewComplete = jest.fn(async () => undefined);

    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <ExportDialog
            draft={draft()}
            hasUploadedEvidence={false}
            lng="en"
            noteName="Kraków Tram"
            onAddInformation={onAddInformation}
            onOpenChange={onOpenChange}
            onReviewComplete={onReviewComplete}
            open
            runId="run-1"
          />
        </ChakraProvider>,
      );
    });
    await settle();

    expect(
      validateChapter.mock.calls.map(([request]) => request.chapterId),
    ).toEqual(["chapter-target", "chapter-related"]);
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
    expect(document.body.textContent).toContain("Add information");
    expect(document.body.textContent).toContain("Accept review");
    expect(document.body.textContent).toContain("Export as is");

    await click("Export as is");
    expect(document.body.textContent).toContain("Export the current draft");
    expect(document.body.textContent).toContain("Export DOCX");
    expect(button("Export DOCX").disabled).toBe(true);
  });
});
