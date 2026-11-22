/** @jest-environment jsdom */

import { beforeAll, beforeEach, expect, it, jest } from "@jest/globals";
import { act, type ReactNode, useState } from "react";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftRunStatus,
} from "@/util/types";
import {
  mockTranslation,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

const context: ConceptNoteApplicationContext = {
  run_id: "run",
  city_id: "city",
  funder: null,
  opportunity: null,
  template: null,
  included_sources: {
    city: true,
    project: false,
    ghgi: false,
    ccra: false,
    hiap: false,
  },
};
const fundedContext: ConceptNoteApplicationContext = {
  ...context,
  funder: { id: "funder", name: "Funder" },
  opportunity: { id: "programme", name: "Programme" },
  template: {
    id: "template",
    name: "Template",
    output_format: null,
    chapter_schema: [{ chapter_ref: "summary", title: "Summary" }],
    required_fields: [],
  },
};
interface WorkspaceState {
  draftStatus: ConceptNoteDraftRunStatus | undefined;
  contextState: "none" | "processing" | "ready";
  hasContent?: boolean;
}
let initialWorkspaceState: WorkspaceState;
let setWorkspaceState: (value: WorkspaceState) => void;
let initialContext: ConceptNoteApplicationContext | undefined;
let reviewProposal: { proposal_id: string } | null = null;
let finishRefetch: (success: boolean) => void;
let setApplicationContext: (value: ConceptNoteApplicationContext) => void;
const refetch = jest.fn<() => Promise<{ isSuccess: boolean }>>();
const refetchDraft = jest.fn();

mockTranslation((key: string) => key);
jest.unstable_mockModule("@/services/api", () => ({
  api: { useConfirmConceptNoteChapterMutation: () => [jest.fn(), {}] },
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-workspace-data",
  () => ({
    useConceptNoteWorkspaceData: () => {
      const [applicationContext, setContext] = useState(initialContext);
      setApplicationContext = setContext;
      const [workspaceState, setState] = useState(initialWorkspaceState);
      setWorkspaceState = setState;
      refetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRefetch = (success) => {
              if (success) setContext(context);
              resolve({ isSuccess: success });
            };
          }),
      );
      return {
        applicationContext,
        applicationContextFailed: !applicationContext,
        applicationContextLoading: false,
        hasApplicationTemplate: Boolean(applicationContext?.template),
        canStartDrafting: Boolean(
          applicationContext?.template?.chapter_schema.length,
        ),
        isDraftRunning: workspaceState.draftStatus === "running",
        draft: workspaceState.draftStatus
          ? {
              status: workspaceState.draftStatus,
              chapters: workspaceState.hasContent
                ? [
                    {
                      chapter_id: "chapter",
                      body_markdown: "Drafted content",
                      gaps: [],
                    },
                  ]
                : [],
            }
          : undefined,
        refetchApplicationContext: refetch,
        refetchDraft,
        reviewAvailabilityDescription: "review-setup-load-error",
        run: {
          run_id: "run",
          city_id: "city",
          name: "Test note",
          status: "active",
          workflow_step: "assembling_context",
          thread_id: null,
          progress_summary: {},
        },
        files: [],
        bundle: { availableContext: { uploadedDocuments: false } },
        contextStatus: {
          state: workspaceState.contextState,
          busy: workspaceState.contextState === "processing",
          blocked: workspaceState.contextState === "processing",
        },
        retryBundleState: {},
        retryingUploadId: null,
        startDraftState: {},
        uploadState: {},
      };
    },
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-edits",
  () => ({
    useConceptNoteEdits: () => ({ proposals: [] }),
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-funder-import",
  () => ({
    useFunderImport: () => ({ phase: "idle", filename: null }),
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-inline-review-decisions",
  () => ({
    useInlineReviewDecisions: () => ({ decisions: {} }),
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/document-review",
  () => ({
    DocumentReviewToolbar: () => <div data-testid="review-toolbar" />,
    DocumentReviewFeedback: () => null,
    documentReviewChanges: () => [],
    editFeedbackKey: () => null,
    selectReviewProposal: () => reviewProposal,
  }),
);
// The draft tab's setup button calls the workspace handler under test.
jest.unstable_mockModule("@/components/ConceptNoteWorkspace/draft-tab", () => ({
  DraftTab: ({
    nextStep,
    onOpenFundingSetup,
  }: {
    nextStep?: ReactNode;
    onOpenFundingSetup: () => void;
  }) => (
    <>
      {nextStep}
      <button aria-label="open-funding-setup" onClick={onOpenFundingSetup} />
    </>
  ),
}));
// Keep workspace state; unrelated panels are outside this test.
for (const [path, name] of [
  ["chat-panel", "ConceptNoteChatPanel"],
  ["context-tab", "ContextTab"],
  ["structure-tab", "StructureTab"],
  ["export-dialog", "ExportDialog"],
]) {
  jest.unstable_mockModule(`@/components/ConceptNoteWorkspace/${path}`, () => ({
    [name]: () => null,
  }));
}
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/funding-selection-dialog",
  () => ({
    FundingSelectionDialog: ({ onSaved }: { onSaved?: () => void }) => (
      <div role="dialog">
        <button aria-label="save-funding" onClick={onSaved} />
      </div>
    ),
  }),
);

let ConceptNoteWorkspace: typeof import("@/components/ConceptNoteWorkspace").ConceptNoteWorkspace;
setupDomShims();
const view = setupTestRoot();
beforeAll(async () => {
  ({ ConceptNoteWorkspace } =
    await import("@/components/ConceptNoteWorkspace"));
});
beforeEach(() => {
  initialContext = undefined;
  initialWorkspaceState = { draftStatus: "not_started", contextState: "none" };
  reviewProposal = null;
  refetch.mockReset();
  refetchDraft.mockReset();
});
async function renderWorkspace() {
  await view.render(
    <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />,
  );
}

async function clickSetup() {
  await renderWorkspace();
  const button = [...view.container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === "open-funding-setup",
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("opens funding after a successful context retry without a second click", async () => {
  await clickSetup();
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => finishRefetch(true));
  expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("keeps funding closed after a failed context retry and allows another attempt", async () => {
  await clickSetup();
  await act(async () => finishRefetch(false));
  expect(view.container.querySelector('[role="dialog"]')).toBeNull();
  await clickSetup();
  await act(async () => finishRefetch(true));
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("opens funding immediately when context is already loaded", async () => {
  initialContext = context;
  await clickSetup();
  expect(refetch).not.toHaveBeenCalled();
  expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("renders the edit review toolbar once, in its own row", async () => {
  reviewProposal = { proposal_id: "proposal" };
  await clickSetup();
  const toolbars = view.container.querySelectorAll(
    '[data-testid="review-toolbar"]',
  );
  expect(toolbars).toHaveLength(1);
  expect(
    toolbars[0].closest('[data-testid="concept-note-review-bar"]'),
  ).not.toBeNull();
});

it("shows one ready-to-draft banner without its own start button until funding is cleared", async () => {
  const template = {
    name: "EIB starter",
    chapter_schema: [{}, {}],
  } as unknown as ConceptNoteApplicationContext["template"];
  initialContext = { ...context, template };
  await clickSetup();
  const save = view.container.querySelector('[aria-label="save-funding"]');
  await act(async () => (save as HTMLButtonElement).click());

  const banner = () =>
    view.container.querySelector('[data-testid="concept-note-next-step"]');
  expect(banner()?.textContent).toContain("next-step-funding-saved-title");
  // The setup panel's Start drafting is the only start button.
  expect(banner()?.textContent).not.toContain("start-drafting");

  await act(async () => setApplicationContext({ ...context, template: null }));
  expect(banner()).toBeNull();
});

it("clears completion guidance when a chapter is added and drafting resumes", async () => {
  initialContext = fundedContext;
  initialWorkspaceState = {
    draftStatus: "running",
    contextState: "ready",
    hasContent: true,
  };
  await clickSetup();
  await act(async () =>
    setWorkspaceState({ ...initialWorkspaceState, draftStatus: "complete" }),
  );
  expect(view.container.textContent).toContain(
    "next-step-draft-complete-title",
  );
  for (const draftStatus of ["not_started", "running", "failed"] as const) {
    await act(async () =>
      setWorkspaceState({ ...initialWorkspaceState, draftStatus }),
    );
    expect(
      view.container.querySelector('[data-testid="concept-note-next-step"]'),
    ).toBeNull();
  }
});

it("uses funding that loads after sources become ready", async () => {
  initialWorkspaceState = {
    draftStatus: "not_started",
    contextState: "processing",
  };
  await clickSetup();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  await act(async () => setApplicationContext(fundedContext));
  expect(view.container.textContent).toContain("next-step-funding-saved-title");
  expect(view.container.textContent).not.toContain(
    "next-step-sources-ready-funding",
  );
});

it("keeps dismissed source guidance closed when funding arrives", async () => {
  initialContext = context;
  initialWorkspaceState = {
    draftStatus: "not_started",
    contextState: "processing",
  };
  await clickSetup();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  const dismiss = view.container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-next-step-dismiss"]',
  );
  expect(dismiss).not.toBeNull();
  await act(async () => dismiss!.click());
  await act(async () => setApplicationContext(fundedContext));
  expect(
    view.container.querySelector('[data-testid="concept-note-next-step"]'),
  ).toBeNull();
});

it("shows source guidance when the draft loads after ready sources", async () => {
  initialContext = fundedContext;
  initialWorkspaceState = { draftStatus: undefined, contextState: "ready" };
  await clickSetup();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  expect(view.container.textContent).toContain("next-step-funding-saved-title");
});

it("waits for sources before showing ready-to-draft guidance after saving funding", async () => {
  initialContext = fundedContext;
  initialWorkspaceState = {
    draftStatus: "not_started",
    contextState: "processing",
  };
  await clickSetup();
  const save = view.container.querySelector<HTMLButtonElement>(
    '[aria-label="save-funding"]',
  );
  await act(async () => save!.click());
  expect(
    view.container.querySelector('[data-testid="concept-note-next-step"]'),
  ).toBeNull();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  expect(view.container.textContent).toContain("next-step-funding-saved-title");
});
