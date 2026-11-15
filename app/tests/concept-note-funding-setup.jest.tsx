/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftRunStatus,
} from "@/util/types";
import type { EditProposal } from "@/util/concept-note-edit-types";

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
const refetchWorkspace = jest.fn(async () => ({}));
const saveSetup = jest.fn();
const confirmChapterMutation = jest.fn();
const loadSelectionProposal = jest.fn(async () => {});
const applySelectionProposal = jest.fn(async (_proposal: EditProposal) => true);
let draftActions: {
  onConfirmChapter: (chapter: unknown) => Promise<void>;
  onAnswerGap: (chapter: unknown, row: unknown) => void;
  onSelectionProposed: (
    proposal: EditProposal,
    manualFormatting?: boolean,
  ) => Promise<void>;
};
let pointKeys: { key: string }[] = [];
let workspaceFetching = false;
let workspaceRevision = 0;
let syncSetup: (() => void) | undefined;

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useConfirmConceptNoteChapterMutation: () => [confirmChapterMutation, {}],
  },
}));
jest.unstable_mockModule("@/services/document-workspace-api", () => ({
  documentWorkspaceApi: {
    useGetDocumentWorkspaceQuery: () => ({
      isFetching: workspaceFetching,
      data: {
        revision: workspaceRevision,
        setup: null,
        points: pointKeys,
        needs: [],
        overview: {
          required_total: 0,
          required_covered: 0,
          optional_total: 0,
          optional_covered: 0,
          waiting_count: 0,
          next_steps: [],
        },
        export_eligibility: {
          working: true,
          final: false,
          blockers: ["Document setup is required"],
          workspace_revision: 0,
        },
      },
      refetch: refetchWorkspace,
    }),
    useSaveDocumentSetupMutation: () => [saveSetup, {}],
  },
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
                ? [{ chapter_id: "chapter", body_markdown: "Drafted content" }]
                : [],
            }
          : undefined,
        refetchApplicationContext: refetch,
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
        uploads: [],
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
    useConceptNoteEdits: () => ({
      proposals: [],
      loadProposal: loadSelectionProposal,
      apply: applySelectionProposal,
    }),
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
  DraftTab: (props: {
    nextStep?: ReactNode;
    onOpenFundingSetup: () => void;
    onConfirmChapter: (chapter: unknown) => Promise<void>;
    onAnswerGap: (chapter: unknown, row: unknown) => void;
    onSelectionProposed: (
      proposal: EditProposal,
      manualFormatting?: boolean,
    ) => Promise<void>;
  }) => {
    draftActions = props;
    return (
      <>
        {props.nextStep}
        <button
          aria-label="open-funding-setup"
          onClick={props.onOpenFundingSetup}
        />
      </>
    );
  },
}));
// Keep workspace state; unrelated panels are outside this test.
for (const [path, name] of [
  ["chat-panel", "ConceptNoteChatPanel"],
  ["context-tab", "ContextTab"],
  ["structure-tab", "StructureTab"],
  ["document-point-card", "DocumentPointCard"],
  ["workspace-source-picker", "WorkspaceSources"],
  ["workspace-export", "WorkspaceExport"],
]) {
  jest.unstable_mockModule(`@/components/ConceptNoteWorkspace/${path}`, () => ({
    [name]: () => null,
  }));
}
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/document-workspace-panels",
  () => ({
    WorkspaceOverview: ({
      onOpenSetup,
      onSyncSetup,
      setupSaving,
    }: {
      onOpenSetup: () => void;
      onSyncSetup: () => void;
      setupSaving: boolean;
    }) => {
      syncSetup = onSyncSetup;
      return (
        <>
          <button onClick={onOpenSetup}>{"workspace-choose-template"}</button>
          <button
            aria-label="sync-setup"
            disabled={setupSaving}
            onClick={onSyncSetup}
          />
        </>
      );
    },
    WorkspaceTodos: ({ selectedKey }: { selectedKey: string }) => (
      <div data-testid="selected-point">{selectedKey}</div>
    ),
  }),
);
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

jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/export-dialog",
  () => ({
    ExportDialog: ({ open }: { open: boolean }) =>
      open ? <div data-testid="document-review-open" /> : null,
  }),
);

let ConceptNoteWorkspace: typeof import("@/components/ConceptNoteWorkspace").ConceptNoteWorkspace;
let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalStructuredClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ ConceptNoteWorkspace } =
    await import("@/components/ConceptNoteWorkspace"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  initialContext = undefined;
  initialWorkspaceState = { draftStatus: "not_started", contextState: "none" };
  reviewProposal = null;
  pointKeys = [];
  workspaceFetching = false;
  workspaceRevision = 0;
  syncSetup = undefined;
  saveSetup.mockReset();
  confirmChapterMutation.mockReset();
  loadSelectionProposal.mockClear();
  applySelectionProposal.mockClear();
  refetch.mockReset();
  refetchWorkspace.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function clickSetup() {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
      </ChakraProvider>,
    );
  });
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "workspace-choose-template",
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function showDraft() {
  const tab = [
    ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((item) => item.getAttribute("aria-label") === "draft-tab");
  expect(tab).toBeDefined();
  await act(async () => tab!.click());
}

it.each([false, true])(
  "applies selection formatting only for an explicit manual command (%s)",
  async (manualFormatting) => {
    initialContext = fundedContext;
    initialWorkspaceState = {
      draftStatus: "complete",
      contextState: "ready",
      hasContent: true,
    };
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
        </ChakraProvider>,
      ),
    );
    await showDraft();
    const proposal: EditProposal = {
      proposal_id: "selection-proposal",
      run_id: "run",
      instruction: "Change selected text",
      scope: {
        kind: "selection",
        chapter_id: "chapter",
        base_revision: 1,
        start: 0,
        end: 4,
        selected_markdown: "Text",
      },
      status: "proposed",
      base_revisions: { chapter: 1 },
      changes: [],
      clarification: null,
      error_code: null,
      result: null,
      created_at: "2026-11-15",
      updated_at: "2026-11-15",
    };
    await act(async () =>
      draftActions.onSelectionProposed(proposal, manualFormatting),
    );
    expect(loadSelectionProposal).toHaveBeenCalledWith(proposal.proposal_id);
    expect(applySelectionProposal).toHaveBeenCalledTimes(
      manualFormatting ? 1 : 0,
    );
    if (manualFormatting)
      expect(applySelectionProposal).toHaveBeenCalledWith(proposal);
  },
);

it("opens funding after a successful context retry without a second click", async () => {
  await clickSetup();
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => finishRefetch(true));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("keeps funding closed after a failed context retry and allows another attempt", async () => {
  await clickSetup();
  await act(async () => finishRefetch(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await clickSetup();
  await act(async () => finishRefetch(true));
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("opens funding immediately when context is already loaded", async () => {
  initialContext = context;
  await clickSetup();
  expect(refetch).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("renders the edit review toolbar once, in its own row", async () => {
  reviewProposal = { proposal_id: "proposal" };
  await clickSetup();
  const toolbars = container.querySelectorAll('[data-testid="review-toolbar"]');
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
  const save = container.querySelector('[aria-label="save-funding"]');
  await act(async () => (save as HTMLButtonElement).click());
  expect(
    [...container.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent === "workspace-overview-tab")
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  await showDraft();

  const banner = () =>
    container.querySelector('[data-testid="concept-note-next-step"]');
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
  await showDraft();
  await act(async () =>
    setWorkspaceState({ ...initialWorkspaceState, draftStatus: "complete" }),
  );
  expect(container.textContent).toContain("next-step-draft-complete-title");
  for (const draftStatus of ["not_started", "running", "failed"] as const) {
    await act(async () =>
      setWorkspaceState({ ...initialWorkspaceState, draftStatus }),
    );
    expect(
      container.querySelector('[data-testid="concept-note-next-step"]'),
    ).toBeNull();
  }
});

it("uses funding that loads after sources become ready", async () => {
  initialWorkspaceState = {
    draftStatus: "not_started",
    contextState: "processing",
  };
  await clickSetup();
  await showDraft();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  await act(async () => setApplicationContext(fundedContext));
  expect(container.textContent).toContain("next-step-funding-saved-title");
  expect(container.textContent).not.toContain(
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
  await showDraft();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  const dismiss = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-next-step-dismiss"]',
  );
  expect(dismiss).not.toBeNull();
  await act(async () => dismiss!.click());
  await act(async () => setApplicationContext(fundedContext));
  expect(
    container.querySelector('[data-testid="concept-note-next-step"]'),
  ).toBeNull();
});

it("shows source guidance when the draft loads after ready sources", async () => {
  initialContext = fundedContext;
  initialWorkspaceState = { draftStatus: undefined, contextState: "ready" };
  await clickSetup();
  await showDraft();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  expect(container.textContent).toContain("next-step-funding-saved-title");
});

it("waits for sources before showing ready-to-draft guidance after saving funding", async () => {
  initialContext = fundedContext;
  initialWorkspaceState = {
    draftStatus: "not_started",
    contextState: "processing",
  };
  await clickSetup();
  const save = container.querySelector<HTMLButtonElement>(
    '[aria-label="save-funding"]',
  );
  await act(async () => save!.click());
  await showDraft();
  expect(
    container.querySelector('[data-testid="concept-note-next-step"]'),
  ).toBeNull();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  expect(container.textContent).toContain("next-step-funding-saved-title");
});

it("opens an existing review deep link directly in Draft instead of Overview", async () => {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace
          cityId="city"
          runId="run"
          lng="en"
          initialReviewChapterId="chapter"
        />
      </ChakraProvider>,
    ),
  );
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  expect(
    tabs
      .find((tab) => tab.getAttribute("aria-label") === "draft-tab")
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    tabs
      .find((tab) => tab.textContent === "workspace-overview-tab")
      ?.getAttribute("aria-selected"),
  ).toBe("false");
});

it("waits for workspace reconciliation before explicit Sync uses the displayed revision", async () => {
  workspaceFetching = true;
  await clickSetup();
  expect(
    (container.querySelector('[aria-label="sync-setup"]') as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => syncSetup?.());
  expect(saveSetup).not.toHaveBeenCalled();
  workspaceFetching = false;
  workspaceRevision = 9;
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
      </ChakraProvider>,
    ),
  );
  await act(async () =>
    (
      container.querySelector('[aria-label="sync-setup"]') as HTMLButtonElement
    ).click(),
  );
  expect(saveSetup).toHaveBeenCalledWith(
    expect.objectContaining({ runId: "run", expected_revision: 9 }),
  );
});

it("opens review instead of sending a confirmation when chapter validation is missing or stale", async () => {
  await clickSetup();
  await showDraft();
  for (const validation of [
    null,
    { status: "ready", validated_revision_number: 1, is_stale: true },
  ]) {
    await act(async () =>
      draftActions.onConfirmChapter({
        chapter_id: "chapter",
        revision_number: 2,
        validation,
      }),
    );
    expect(confirmChapterMutation).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="document-review-open"]'),
    ).not.toBeNull();
  }
});

it("canonical gap navigation selects the same point in To do", async () => {
  pointKeys = [{ key: "award_date" }];
  await clickSetup();
  await showDraft();
  await act(async () =>
    draftActions.onAnswerGap(
      { chapter_id: "chapter", title: "Funding" },
      { gap: { field_key: "award_date" } },
    ),
  );
  expect(
    container.querySelector('[data-testid="selected-point"]')?.textContent,
  ).toBe("award_date");
  expect(
    [...container.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent === "workspace-todo-tab")
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});

it("keeps To do selected when background proposals arrive and offers intentional navigation", async () => {
  pointKeys = [{ key: "award_date" }];
  await clickSetup();
  await showDraft();
  await act(async () =>
    draftActions.onAnswerGap(
      { chapter_id: "chapter", title: "Funding" },
      { gap: { field_key: "award_date" } },
    ),
  );
  reviewProposal = { proposal_id: "new-background-proposal" };
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
      </ChakraProvider>,
    ),
  );
  expect(
    container
      .querySelector('[role="tab"][aria-label="workspace-todo-tab"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
  const view = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "edit-view-changes",
  );
  expect(view).toBeDefined();
  await act(async () => view!.click());
  expect(
    container
      .querySelector('[role="tab"][aria-label="draft-tab"]')
      ?.getAttribute("aria-selected"),
  ).toBe("true");
});
