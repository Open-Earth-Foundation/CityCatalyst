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
import { act } from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder } from "node:util";
import type { ConceptNoteRun, ConceptNoteUploadResponse } from "@/util/types";

let contextScenario: Pick<
  ConceptNoteRun,
  "progress_summary" | "uploads" | "manual_population"
> | null = null;
let cityPopulation:
  { cityId: string; population?: number; year?: number } | undefined;
let currentUpload: ConceptNoteUploadResponse | undefined;
let uploading = false;
const t = (key: string, values?: { population: string; year: number }) =>
  key === "population" && values
    ? `${values.population} residents · ${values.year}`
    : key;
const originalFetch = globalThis.fetch;
const stopStream = jest.fn();
const startStream = jest.fn(async () => undefined);
let streamOptions: { onError?: (message: string, code?: string) => void };
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: (options: typeof streamOptions) => {
    streamOptions = options;
    return { startStream, stopStream };
  },
}));

const persistedUploadId = "persisted-upload";
const refetchRun = jest.fn(async () => undefined);
const observeWorkspace = jest.fn();
const dispatch = jest.fn();
const upsertQueryEntries = jest.fn((entries: unknown) => ({ entries }));
const startedDraft = { run_id: "run-1", status: "running", chapters: [] };
const startDraft = jest.fn(() => ({ unwrap: async () => startedDraft }));
const refetchApplicationContext = jest.fn(async () => undefined);
const getApplicationContext = jest.fn(() => ({
  data: undefined as unknown,
  isError: false,
  isLoading: false,
  refetch: refetchApplicationContext,
}));
jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: () => dispatch,
}));
const getDraftQuery = jest.fn(() => ({
  data: undefined,
  isError: false,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
}));
const getCityYearsQuery = jest.fn(
  (_cityId: string, _options?: Record<string, unknown>) => ({
    data: undefined,
    isLoading: false,
  }),
);
const getRunQuery = jest.fn(() => ({
  data: contextScenario ?? {
    progress_summary: {},
    uploads: [
      {
        completed_at: "2026-09-03T09:59:00Z",
        error_code: "OCR_FAILED",
        filename: "evidence.pdf",
        page_count: null,
        received_at: "2026-09-03T09:50:00Z",
        run_id: "run-1",
        source_format: "pdf",
        source_label: "evidence.pdf",
        status: "failed",
        upload_id: persistedUploadId,
      },
    ],
  },
  isError: false,
  isLoading: false,
  refetch: refetchRun,
}));
const getUploadQuery = jest.fn(() => ({
  currentData: currentUpload,
  data: undefined,
  isError: false,
}));
const updateManualPopulation = jest.fn(() => ({
  unwrap: async () => undefined,
}));
const uploadSourceMutation = jest.fn(() => ({
  unwrap: async (): Promise<unknown> => ({
    uploadId: "new",
    status: "queued",
    filename: "budget.pdf",
  }),
}));
const retryUpload = jest.fn(() => ({
  unwrap: async () => ({
    filename: "evidence.pdf",
    receivedAt: "2026-09-03T10:00:00Z",
    runId: "run-1",
    sourceLabel: "evidence.pdf",
    status: "queued" as const,
    uploadId: persistedUploadId,
  }),
}));

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-workspace-events",
  () => ({ useConceptNoteWorkspaceEvents: observeWorkspace }),
);

jest.unstable_mockModule("@/services/api", () => ({
  api: {
    util: { upsertQueryEntries },
    useGetCityQuery: () => ({ data: { name: "Test City" } }),
    useGetConceptNoteApplicationContextQuery: getApplicationContext,
    useGetConceptNoteDraftQuery: getDraftQuery,
    useGetConceptNoteRunQuery: getRunQuery,
    useGetConceptNoteUploadStatusQuery: getUploadQuery,
    useGetInventoryByCityIdQuery: () => ({ data: undefined }),
    useGetCityDashboardQuery: () => ({ data: undefined }),
    useGetCityYearsQuery: getCityYearsQuery,
    useRefreshConceptNoteContextBundleMutation: () => [
      jest.fn(() => ({ unwrap: async () => ({ status: "current" }) })),
      { isLoading: false },
    ],
    useSelectConceptNoteInventoryMutation: () => [
      jest.fn(),
      { isLoading: false },
    ],
    useGetMostRecentCityPopulationQuery: () => ({
      data: cityPopulation,
      isError: false,
      isLoading: false,
    }),
    useUpdateConceptNotePopulationMutation: () => [
      updateManualPopulation,
      { isLoading: false },
    ],
    useGetUserFilesQuery: () => ({ data: [] }),
    useRetryConceptNoteContextBundleMutation: () => [
      jest.fn(),
      { isLoading: false },
    ],
    useRetryConceptNoteUploadMutation: () => [
      retryUpload,
      { isLoading: false },
    ],
    useStartConceptNoteDraftMutation: () => [
      startDraft,
      { isError: false, isLoading: false },
    ],
    useUploadConceptNoteSourceMutation: () => [
      uploadSourceMutation,
      { isLoading: uploading },
    ],
  },
}));

let useConceptNoteWorkspaceData: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data").useConceptNoteWorkspaceData;
let listConceptNoteUploads: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data").listConceptNoteUploads;
let container: HTMLDivElement;
let root: Root;
let Panel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let ContextTab: typeof import("@/components/ConceptNoteWorkspace/context-tab").ContextTab;
const composerRequest = { id: "draft", content: "Use the new document" };

function ChatHarness() {
  const { contextStatus } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });
  return (
    <ChakraProvider value={defaultSystem}>
      <Panel
        contextStatus={contextStatus}
        composerRequest={composerRequest}
        draftOverviewPending={false}
        lng="en"
        onOpenContext={() => {}}
        runId="run-1"
        threadId="thread-1"
        editScope={{ kind: "auto" }}
        edits={{ loadProposal: async () => {} } as never}
      />
    </ChakraProvider>
  );
}

function ContextHarness() {
  const data = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });
  return (
    <ChakraProvider value={defaultSystem}>
      <ContextTab
        applicationContext={null}
        onSelectFunding={() => {}}
        fundingLoading={false}
        fundingError={false}
        onRetryFunding={() => {}}
        bundle={data.bundle}
        contextStatus={data.contextStatus}
        cityDashboard={null}
        cityDashboardFailed={false}
        cityDashboardLoading={false}
        cityFilesCount={0}
        cityId="city-1"
        cityName="Test City"
        country={null}
        firstCityFile={null}
        inventoryAvailable={false}
        inventoryFailed={false}
        inventoryHasData={false}
        inventoryId={null}
        inventoryLoading={false}
        inventoryOptions={[]}
        inventorySelectionSaving={false}
        inventoryYear={null}
        onSelectInventory={async () => {}}
        isDraftRunning={false}
        isRetryingBundle={false}
        isRetryingUpload={false}
        isUploading={false}
        lng="en"
        manualPopulation={null}
        manualPopulationSaving={false}
        onRetryBundle={() => {}}
        onRetryUpload={() => {}}
        onSaveManualPopulation={async () => {}}
        onUploadFile={async () => {}}
        populationFailed={false}
        populationLabel="population-unavailable"
        populationLoading={false}
        populationMissing={true}
        uploads={data.uploads}
        uploadError={null}
      />
    </ChakraProvider>
  );
}

function source(
  status: "ready" | "failed" | "processing",
  id: string,
): NonNullable<ConceptNoteRun["uploads"]>[number] {
  return {
    upload_id: id,
    run_id: "run-1",
    status,
    filename: `${id}.pdf`,
    source_format: "pdf",
    received_at: "2026-09-14T12:00:00Z",
  };
}

function Harness() {
  const { retryActiveUpload, contextStatus } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });

  return (
    <button data-testid="retry" onClick={retryActiveUpload}>
      {contextStatus.state}
    </button>
  );
}

function PopulationHarness() {
  const { populationLabel, saveManualPopulation } = useConceptNoteWorkspaceData(
    {
      cityId: "city-1",
      lng: "en",
      runId: "run-1",
    },
  );
  return (
    <button
      onClick={() =>
        void saveManualPopulation({ population: 123456, year: 2024 })
      }
    >
      {populationLabel}
    </button>
  );
}

function UploadHarness({ file }: { file: File }) {
  const { effectiveUploadError, uploadSource } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });
  return (
    <button onClick={() => void uploadSource(file)}>
      {effectiveUploadError ?? "no-error"}
    </button>
  );
}

function TrackingHarness({ initialUploadId }: { initialUploadId?: string }) {
  const { contextStatus, uploads } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    initialUploadId,
    lng: "en",
    runId: "run-1",
  });
  return (
    <p data-state={contextStatus.state}>
      {uploads.map((upload) => upload.filename).join(",")}
    </p>
  );
}

const onSourceReviewComplete = jest.fn();
function SourceReviewHarness({
  overviewPending,
  sourceReviewPending,
}: {
  overviewPending: boolean;
  sourceReviewPending: boolean;
}) {
  const { contextStatus } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });
  return (
    <ChakraProvider value={defaultSystem}>
      <Panel
        contextStatus={contextStatus}
        composerRequest={null}
        draftOverviewPending={overviewPending}
        sourceReviewPending={sourceReviewPending}
        onSourceReviewComplete={onSourceReviewComplete}
        lng="en"
        onOpenContext={() => {}}
        runId="run-1"
        threadId="thread-1"
        editScope={{ kind: "auto", focused_chapter_id: "budget" }}
        edits={{ loadProposal: async () => {} } as never}
      />
    </ChakraProvider>
  );
}

const readyEvidence = {
  context_bundle: {
    status: "ready",
    document_grounding: "uploaded_evidence",
    source_counts: { ready: 1 },
  },
};

function pdf(name = "budget.pdf"): File {
  const file = new File(["%PDF-1.7 budget"], name, {
    type: "application/pdf",
  });
  // jsdom blobs cannot be read; serve the PDF signature validation checks.
  return Object.assign(file, {
    slice: () => ({
      arrayBuffer: async () => Uint8Array.from(Buffer.from("%PDF-")).buffer,
    }),
  });
}

function streamBody(index: number): {
  context: Record<string, unknown>;
  options?: { concept_note_turn?: string };
} {
  const call = startStream.mock.calls[index] as unknown as [
    string,
    { body: string },
  ];
  return JSON.parse(call[1].body);
}

function DraftStartHarness() {
  const { startDrafting } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });
  return <button onClick={startDrafting}>{t("start-draft")}</button>;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Source validation reads the PDF signature; jsdom lacks both APIs.
  Object.assign(globalThis, { TextDecoder });
  HTMLElement.prototype.scrollTo = jest.fn() as never;
  // Chakra recipes are JSON-compatible; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ useConceptNoteWorkspaceData, listConceptNoteUploads } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data"));
  ({ ConceptNoteChatPanel: Panel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
  ({ ContextTab } =
    await import("@/components/ConceptNoteWorkspace/context-tab"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  contextScenario = null;
  cityPopulation = undefined;
  updateManualPopulation.mockClear();
  currentUpload = undefined;
  uploading = false;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ messages: [] }),
  })) as unknown as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useConceptNoteWorkspaceData", () => {
  it("reloads the city's inventories on focus so the picker sees new ones", async () => {
    await act(async () => root.render(<DraftStartHarness />));

    expect(getCityYearsQuery).toHaveBeenCalledWith(
      "city-1",
      expect.objectContaining({ refetchOnFocus: true }),
    );
  });

  it("seeds running state from the start response even when the status GET failed", async () => {
    getApplicationContext.mockReturnValueOnce({
      data: { funder: {}, opportunity: {}, template: { chapter_schema: [{}] } },
      isError: false,
      isLoading: false,
    });
    getDraftQuery.mockReturnValueOnce({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    await act(async () => root.render(<DraftStartHarness />));
    await act(async () => container.querySelector("button")!.click());
    expect(upsertQueryEntries).toHaveBeenCalledWith([
      {
        endpointName: "getConceptNoteDraft",
        arg: "run-1",
        value: startedDraft,
      },
    ]);
  });

  it("observes a failed initial draft read even without cached running state", async () => {
    getDraftQuery.mockReturnValueOnce({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    });
    await act(async () => root.render(<Harness />));
    expect(observeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ observeDraft: true }),
    );
  });

  it("observes a failed run read so the first successful snapshot can initialize the cache", async () => {
    getRunQuery.mockReturnValueOnce({
      data: undefined as never,
      isError: true,
      isLoading: false,
      refetch: refetchRun,
    });
    await act(async () => root.render(<Harness />));
    expect(observeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ observeRun: true }),
    );
  });

  it("uses initial reads without recurring workspace polling", async () => {
    await act(async () => root.render(<Harness />));

    const revalidation = {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    };
    expect(getRunQuery).toHaveBeenCalledWith(
      {
        cityId: "city-1",
        runId: "run-1",
      },
      revalidation,
    );
    expect(getDraftQuery).toHaveBeenCalledWith("run-1", revalidation);
    expect(getUploadQuery).toHaveBeenCalledWith(
      { runId: "run-1", uploadId: persistedUploadId },
      { skip: false, ...revalidation },
    );
    expect(observeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        observeDraft: false,
        observeRun: false,
        observeUpload: false,
      }),
    );
  });

  it("keeps both file labels processing until OCR evidence reaches the chat context", async () => {
    contextScenario = {
      uploads: [source("ready", "A")],
      progress_summary: { context_bundle: { status: "building" } },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(container.textContent).toContain("A.pdf");
    expect(container.textContent?.match(/status-processing/g)).toHaveLength(2);
    expect(container.textContent).not.toContain("status-ready");

    contextScenario.progress_summary = {
      context_bundle: {
        status: "ready",
        document_grounding: "uploaded_evidence",
        source_counts: { ready: 1 },
      },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(container.textContent?.match(/status-ready/g)).toHaveLength(2);
    expect(container.textContent).not.toContain("status-processing");

    contextScenario.progress_summary = { context_bundle: { status: "failed" } };
    await act(async () => root.render(<ContextHarness />));
    expect(container.textContent?.match(/status-failed/g)).toHaveLength(2);
    expect(container.textContent).not.toContain("status-ready");
  });
  it("labels a file that is still converting as converting, not processing", async () => {
    contextScenario = {
      uploads: [source("processing", "A")],
      progress_summary: { context_bundle: { status: "building" } },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(container.textContent).toContain("status-converting");
    expect(container.textContent).not.toContain("status-processing");
  });
  it("shows a run-scoped manual population when the city source has no value", async () => {
    cityPopulation = { cityId: "city-1" };
    contextScenario = {
      progress_summary: {},
      uploads: [],
      manual_population: null,
    };
    await act(async () => root.render(<PopulationHarness />));
    expect(container.textContent).toBe("population-unavailable");

    contextScenario.manual_population = { population: 123456, year: 2024 };
    await act(async () => root.render(<PopulationHarness />));
    expect(container.textContent).toBe("123,456 residents · 2024");

    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(updateManualPopulation).toHaveBeenCalledWith({
      cityId: "city-1",
      runId: "run-1",
      manualPopulation: { population: 123456, year: 2024 },
    });
  });

  it("enables the real chat composer after failed A is superseded by ready B, including reload", async () => {
    contextScenario = {
      progress_summary: {},
      uploads: [source("failed", "A")],
    };
    await act(async () => root.render(<ChatHarness />));
    expect(container.querySelector("input")!.disabled).toBe(true);

    contextScenario = {
      uploads: [source("ready", "B"), source("failed", "A")],
      progress_summary: {
        context_bundle: {
          status: "ready",
          document_grounding: "uploaded_evidence",
          source_counts: { ready: 1, failed: 1 },
        },
      },
    };
    await act(async () => root.render(<ChatHarness />));
    expect(container.querySelector("input")!.disabled).toBe(false);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<ChatHarness />));
    await act(async () => {
      await new Promise(requestAnimationFrame);
    });
    expect(container.querySelector("input")!.disabled).toBe(false);
    const send = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(send.disabled).toBe(false);
    await act(async () => send.click());
    expect(startStream).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(startStream.mock.calls[0]?.[1]?.body))).toEqual({
      threadId: "thread-1",
      content: composerRequest.content,
      context: {
        concept_note_run_id: "run-1",
        ui_locale: "en",
        concept_note_edit: {
          scope: { kind: "auto" },
          idempotency_key: expect.any(String),
        },
      },
    });

    // A backend readiness rejection must not leave a phantom accepted turn.
    await act(async () =>
      streamOptions.onError?.("Not ready", "concept_note_context_not_ready"),
    );
    expect(container.textContent).toContain("chat-context-not-ready");
    expect(container.textContent).not.toContain(composerRequest.content);
    expect(container.querySelector("input")!.disabled).toBe(false);
  });

  it("keeps pending uploads and the latest failed upload blocked", async () => {
    contextScenario = {
      uploads: [source("ready", "B"), source("processing", "A")],
      progress_summary: {
        context_bundle: {
          status: "ready",
          document_grounding: "uploaded_evidence",
          source_counts: { ready: 1 },
        },
      },
    };
    await act(async () => root.render(<ChatHarness />));
    expect(container.querySelector("input")!.disabled).toBe(true);
    contextScenario.uploads = [source("failed", "B"), source("ready", "A")];
    await act(async () => root.render(<ChatHarness />));
    expect(container.querySelector("input")!.disabled).toBe(true);
  });

  it("blocks chat until upload processing and the context bundle are both ready", async () => {
    contextScenario = { progress_summary: {}, uploads: [] };
    currentUpload = { uploadId: "new", status: "processing" };
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toBe("processing");
    currentUpload = { uploadId: "new", status: "ready" };
    contextScenario.progress_summary = {
      context_bundle: { status: "building" },
    };
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toBe("processing");
    contextScenario.progress_summary = {
      context_bundle: {
        status: "ready",
        document_grounding: "uploaded_evidence",
        source_counts: { ready: 1 },
      },
    };
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toBe("ready");
    uploading = true;
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toBe("uploading");
  });

  it("keeps watching the run while the ready bundle lags behind a finished upload", async () => {
    const readyUpload = (id: string) => ({
      completed_at: "2026-09-25T10:00:00Z",
      filename: `${id}.md`,
      page_count: null,
      received_at: "2026-09-25T09:59:00Z",
      run_id: "run-1",
      source_format: "markdown",
      source_label: id,
      status: "ready",
      upload_id: id,
    });
    // The new upload is ready but the rebuild has not started yet.
    contextScenario = {
      progress_summary: {
        context_bundle: {
          status: "ready",
          build_id: "build-1",
          document_grounding: "uploaded_evidence",
          source_counts: { ready: 1 },
        },
      },
      uploads: [readyUpload("new"), readyUpload("old")],
    } as never;
    await act(async () => root.render(<Harness />));

    expect(container.textContent).toBe("processing");
    expect(observeWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ observeRun: true }),
    );
  });

  it("refetches the draft when a rebuild finishes so a new file's review can start", async () => {
    const refetchDraft = jest.fn(async () => undefined);
    getDraftQuery.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: refetchDraft,
    });
    const readyBuild = (buildId: string) => ({
      context_bundle: {
        status: "ready",
        build_id: buildId,
        document_grounding: "uploaded_evidence",
        source_counts: { ready: 1 },
      },
    });
    contextScenario = { progress_summary: readyBuild("build-1"), uploads: [] };
    await act(async () => root.render(<Harness />));
    expect(refetchDraft).not.toHaveBeenCalled();

    contextScenario = { progress_summary: readyBuild("build-2"), uploads: [] };
    await act(async () => root.render(<Harness />));
    expect(refetchDraft).toHaveBeenCalledTimes(1);
    expect(refetchApplicationContext).toHaveBeenCalledTimes(1);
    getDraftQuery.mockReset();
    getDraftQuery.mockImplementation(() => ({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    }));
  });

  it("retries a failed upload restored from the persisted run", async () => {
    await act(async () => root.render(<Harness />));

    const retryButton = container.querySelector("button");
    if (!(retryButton instanceof HTMLButtonElement)) {
      throw new Error("Retry button not found");
    }

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(retryUpload).toHaveBeenCalledWith({
      runId: "run-1",
      uploadId: persistedUploadId,
    });
    expect(refetchRun).not.toHaveBeenCalled();
  });

  it.each([
    [
      "problem body",
      {
        code: "concept_note_upload_limit_reached",
        detail: "A concept note can have at most 10 files",
        status: 409,
      },
    ],
    [
      "nested detail",
      { detail: { code: "concept_note_upload_limit_reached" } },
    ],
  ])(
    "tells the user when Climate Advisor rejects a file over the limit (%s)",
    async (_shape, data) => {
      contextScenario = {
        progress_summary: readyEvidence,
        uploads: Array.from({ length: 9 }, (_, index) =>
          source("ready", `file-${index}`),
        ),
      };
      uploadSourceMutation.mockReturnValueOnce({
        unwrap: async () => {
          throw { status: 409, data };
        },
      });
      await act(async () => root.render(<UploadHarness file={pdf()} />));
      await act(async () => container.querySelector("button")!.click());
      expect(uploadSourceMutation).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe("upload-limit-reached");
    },
  );

  it("keeps the generic message for other upload failures", async () => {
    contextScenario = { progress_summary: {}, uploads: [] };
    uploadSourceMutation.mockReturnValueOnce({
      unwrap: async () => {
        throw { status: 409, data: { detail: { code: "other_conflict" } } };
      },
    });
    await act(async () => root.render(<UploadHarness file={pdf()} />));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("upload-source-error");
  });

  it("does not send an 11th file once the note has 10 uploads", async () => {
    contextScenario = {
      progress_summary: readyEvidence,
      uploads: Array.from({ length: 10 }, (_, index) =>
        source(index ? "ready" : "failed", `file-${index}`),
      ),
    };
    await act(async () => root.render(<UploadHarness file={pdf()} />));
    await act(async () => container.querySelector("button")!.click());
    expect(uploadSourceMutation).not.toHaveBeenCalled();
    expect(container.textContent).toBe("upload-limit-reached");
  });

  it("stops tracking ?uploadId once the run lists it and drops it from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/en/cities/city-1/concept-notes/run-1?uploadId=A&chapterId=ch-1",
    );
    contextScenario = {
      progress_summary: readyEvidence,
      uploads: [source("ready", "B"), source("failed", "A")],
    };
    await act(async () => root.render(<TrackingHarness initialUploadId="A" />));

    // The newest upload drives status; the stale failed first file does not.
    expect(getUploadQuery).toHaveBeenLastCalledWith(
      { runId: "run-1", uploadId: "B" },
      expect.anything(),
    );
    const view = container.querySelector("p")!;
    expect(view.dataset.state).toBe("ready");
    expect(view.textContent).toBe("B.pdf,A.pdf");
    expect(window.location.pathname).toBe(
      "/en/cities/city-1/concept-notes/run-1",
    );
    expect(window.location.search).toBe("?chapterId=ch-1");
  });

  it("tracks a new note's first upload until the run lists it", async () => {
    window.history.replaceState(
      null,
      "",
      "/en/cities/city-1/concept-notes/run-1?uploadId=A",
    );
    contextScenario = { progress_summary: {}, uploads: [] };
    await act(async () => root.render(<TrackingHarness initialUploadId="A" />));

    expect(getUploadQuery).toHaveBeenLastCalledWith(
      { runId: "run-1", uploadId: "A" },
      expect.anything(),
    );
    expect(container.querySelector("p")!.dataset.state).toBe("processing");
    expect(window.location.search).toBe("?uploadId=A");
  });

  it("asks Clima to review new files once, after the drafting overview", async () => {
    contextScenario = {
      progress_summary: readyEvidence,
      uploads: [source("ready", "B")],
    };
    const render = async (
      overviewPending: boolean,
      sourceReviewPending: boolean,
    ) => {
      await act(async () =>
        root.render(
          <SourceReviewHarness
            overviewPending={overviewPending}
            sourceReviewPending={sourceReviewPending}
          />,
        ),
      );
      await act(async () => {
        await new Promise(requestAnimationFrame);
      });
    };
    const turns = () =>
      startStream.mock.calls.map(
        (_, index) => streamBody(index).options?.concept_note_turn,
      );

    await render(true, true);
    expect(turns()).toEqual(["draft_overview"]);
    await act(async () => streamOptions.onComplete?.());

    await render(false, true);
    expect(turns()).toEqual(["draft_overview", "source_review"]);
    expect(streamBody(1).context.concept_note_edit).toEqual({
      scope: { kind: "auto", focused_chapter_id: "budget" },
      idempotency_key: expect.any(String),
    });
    // The hidden request never shows up as a user message.
    expect(container.textContent).not.toContain("source_review");

    await act(async () => streamOptions.onComplete?.());
    expect(onSourceReviewComplete).toHaveBeenCalledTimes(1);
    // Still pending until the draft refetch lands: no second request.
    await render(false, true);
    expect(turns()).toHaveLength(2);

    // A later upload makes a new review pending.
    await render(false, false);
    await render(false, true);
    expect(turns()).toEqual([
      "draft_overview",
      "source_review",
      "source_review",
    ]);
  });

  it("merges the tracked upload into the list and leads with a file the run has not listed", () => {
    const runUploads = [source("processing", "A")];
    expect(
      listConceptNoteUploads(runUploads, {
        uploadId: "A",
        status: "ready",
        pageCount: 4,
        canRetry: false,
      }),
    ).toEqual([
      expect.objectContaining({
        uploadId: "A",
        filename: "A.pdf",
        status: "ready",
        pageCount: 4,
      }),
    ]);
    expect(
      listConceptNoteUploads(runUploads, {
        uploadId: "new",
        status: "queued",
        filename: "new.pdf",
      }).map((upload) => upload.uploadId),
    ).toEqual(["new", "A"]);
  });
});
