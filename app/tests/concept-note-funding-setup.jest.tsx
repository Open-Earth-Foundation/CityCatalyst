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
  ConceptNoteDraftChapter,
  ConceptNoteDraftRunStatus,
} from "@/util/types";
import type { ChapterGapRow } from "@/components/ConceptNoteWorkspace/chapter-gaps-panel";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";

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
const refetchDraft = jest.fn<() => { unwrap: () => Promise<unknown> }>();
// Draft chapters the mocked workspace data holds; a refresh replaces them.
let initialDraftChapters: ConceptNoteDraftChapter[] | null = null;
let nextDraftChapters: ConceptNoteDraftChapter[] | null = null;
let setDraftChapters: (value: ConceptNoteDraftChapter[] | null) => void = () =>
  undefined;
let chapterGapRows: typeof import("@/components/ConceptNoteWorkspace/chapter-gaps-panel").chapterGapRows;

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const adoptLegacyMarkerGaps =
  jest.fn<(request: unknown) => { unwrap: () => Promise<unknown> }>();
let gapAnswerShown: GapAnswerRequest | null = null;
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useConfirmConceptNoteChapterMutation: () => [jest.fn(), {}],
    useAdoptConceptNoteLegacyMarkerGapsMutation: () => [
      adoptLegacyMarkerGaps,
      {},
    ],
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
      const [draftChapters, setChapters] = useState(initialDraftChapters);
      setDraftChapters = setChapters;
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
              chapters:
                draftChapters ??
                (workspaceState.hasContent
                  ? [
                      {
                        chapter_id: "chapter",
                        body_markdown: "Drafted content",
                        gaps: [],
                      },
                    ]
                  : []),
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
const MARKER = "[Information needed: Who signs the agreement?]";
const markerChapter = {
  chapter_id: "chapter",
  title: "Applicant",
  body_markdown: `Signed by ${MARKER}`,
  gaps: [],
} as unknown as ConceptNoteDraftChapter;
// The draft tab's buttons call the workspace handlers under test. Gap actions
// stay hidden while unrecorded markers are held, as the real tab hides them.
jest.unstable_mockModule("@/components/ConceptNoteWorkspace/draft-tab", () => ({
  DraftTab: ({
    draft,
    nextStep,
    onOpenFundingSetup,
    onAnswerGap,
    legacyGapSyncPending,
    legacyGapSyncError,
    onRetryLegacyGapSync,
    mutationError,
  }: {
    draft?: { chapters: ConceptNoteDraftChapter[] } | null;
    nextStep?: ReactNode;
    onOpenFundingSetup: () => void;
    onAnswerGap: (chapter: ConceptNoteDraftChapter, row: ChapterGapRow) => void;
    legacyGapSyncPending?: boolean;
    legacyGapSyncError?: boolean;
    onRetryLegacyGapSync?: () => void;
    mutationError?: string | null;
  }) => {
    const rows = (draft?.chapters ?? []).flatMap((chapter) =>
      chapterGapRows(chapter).map((row) => ({ chapter, row })),
    );
    return (
      <>
        {nextStep}
        {legacyGapSyncPending && !legacyGapSyncError && (
          <p role="status">{"gap-adopting"}</p>
        )}
        {legacyGapSyncError && (
          <>
            <p role="alert">{"gap-adopt-error"}</p>
            <button
              aria-label="retry-legacy-gaps"
              onClick={onRetryLegacyGapSync}
            />
          </>
        )}
        {mutationError && <p role="alert">{mutationError}</p>}
        <button aria-label="open-funding-setup" onClick={onOpenFundingSetup} />
        {!legacyGapSyncPending &&
          rows.map(({ chapter, row }, index) => (
            <button
              key={row.id}
              aria-label={`answer-row-${index}`}
              onClick={() => onAnswerGap(chapter, row)}
            />
          ))}
      </>
    );
  },
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/chat-panel",
  () => ({
    ConceptNoteChatPanel: ({
      gapAnswer,
    }: {
      gapAnswer: GapAnswerRequest | null;
    }) => {
      gapAnswerShown = gapAnswer;
      return null;
    },
  }),
);
// Keep workspace state; unrelated panels are outside this test.
for (const [path, name] of [
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
  ({ chapterGapRows } =
    await import("@/components/ConceptNoteWorkspace/chapter-gaps-panel"));
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
  initialDraftChapters = null;
  nextDraftChapters = null;
  refetch.mockReset();
  adoptLegacyMarkerGaps.mockReset();
  adoptLegacyMarkerGaps.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  refetchDraft.mockReset();
  refetchDraft.mockImplementation(() => ({
    unwrap: async () => {
      if (nextDraftChapters) setDraftChapters(nextDraftChapters);
      return { chapters: nextDraftChapters ?? [] };
    },
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function renderWorkspace() {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
      </ChakraProvider>,
    );
  });
}

async function clickSetup() {
  await renderWorkspace();
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === "open-funding-setup",
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

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
  expect(
    container.querySelector('[data-testid="concept-note-next-step"]'),
  ).toBeNull();
  await act(async () =>
    setWorkspaceState({ draftStatus: "not_started", contextState: "ready" }),
  );
  expect(container.textContent).toContain("next-step-funding-saved-title");
});

const adoptedGap = {
  gap_id: "adopted-gap",
  field_key: "adopted_0123456789ab",
  question: "Who signs the agreement?",
  why_asking: "Confirm it so Clima can update the Applicant chapter.",
  severity: "critical",
  state: "open",
  suggestions: [],
  source_refs: [],
  version: 1,
  resolution: null,
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T00:00:00Z",
};
const recordedChapter = {
  ...markerChapter,
  gaps: [adoptedGap],
} as unknown as ConceptNoteDraftChapter;
const plainChapter = {
  chapter_id: "plain",
  title: "Summary",
  body_markdown: "Plain text with no missing information.",
  gaps: [],
} as unknown as ConceptNoteDraftChapter;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function retryButton() {
  return container.querySelector<HTMLButtonElement>(
    '[aria-label="retry-legacy-gaps"]',
  )!;
}

it("adopts all detected legacy markers on open before showing gap controls", async () => {
  let finishAdoption!: () => void;
  initialWorkspaceState = { draftStatus: "complete", contextState: "ready" };
  initialDraftChapters = [markerChapter];
  nextDraftChapters = [recordedChapter];
  adoptLegacyMarkerGaps.mockReturnValue({
    unwrap: () =>
      new Promise((resolve) => {
        finishAdoption = () => resolve({});
      }),
  });
  await renderWorkspace();

  // One run-level request, sent before any click, while the gap controls wait.
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(1);
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledWith({ runId: "run" });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "gap-adopting",
  );
  expect(container.querySelector('[aria-label="answer-row-0"]')).toBeNull();

  await act(async () => finishAdoption());
  expect(refetchDraft).toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')).toBeNull();

  // The click opens the bound form on the record; it sends nothing further.
  const answer = container.querySelector<HTMLButtonElement>(
    '[aria-label="answer-row-0"]',
  );
  expect(answer).not.toBeNull();
  await act(async () => answer!.click());
  expect(gapAnswerShown?.row).toMatchObject({
    id: "adopted-gap",
    marker: MARKER,
    gap: { gap_id: "adopted-gap", version: 1 },
  });
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(1);
});

it("keeps a normal draft free of adoption requests", async () => {
  initialWorkspaceState = { draftStatus: "complete", contextState: "ready" };
  initialDraftChapters = [plainChapter];
  await renderWorkspace();
  await settle();
  expect(adoptLegacyMarkerGaps).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("retries failed batch adoption without looping", async () => {
  initialWorkspaceState = { draftStatus: "complete", contextState: "ready" };
  initialDraftChapters = [markerChapter];
  nextDraftChapters = [markerChapter];
  adoptLegacyMarkerGaps
    .mockReturnValueOnce({ unwrap: () => Promise.reject(new Error("network")) })
    .mockReturnValueOnce({ unwrap: () => Promise.resolve({}) })
    .mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
  await renderWorkspace();
  await settle();

  // A failed request shows the error and waits for Retry; it does not loop.
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "gap-adopt-error",
  );
  await settle();
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(1);

  // A successful request whose refreshed draft still lacks records is not
  // retried automatically either; Retry is the only way to send it again.
  await act(async () => retryButton().click());
  await settle();
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "gap-adopt-error",
  );
  await settle();
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(2);

  nextDraftChapters = [recordedChapter];
  await act(async () => retryButton().click());
  await settle();
  expect(adoptLegacyMarkerGaps).toHaveBeenCalledTimes(3);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[aria-label="answer-row-0"]')).not.toBeNull();
});
