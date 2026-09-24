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
const getApplicationContext = jest.fn(() => ({
  data: undefined as unknown,
  isError: false,
  isLoading: false,
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
const retryBundle = jest.fn();
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
      jest.fn(),
      { isLoading: uploading },
    ],
  },
}));

let useConceptNoteWorkspaceData: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data").useConceptNoteWorkspaceData;
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
        cityFilesCount={0}
        cityName="Test City"
        country={null}
        firstCityFile={null}
        inventoryYear={null}
        isDraftRunning={false}
        isRetryingBundle={false}
        isRetryingUpload={false}
        isUploading={false}
        livePopulation={data.populationData}
        lng="en"
        manualPopulation={null}
        manualPopulationSaving={false}
        onRetryBundle={retryBundle}
        onRetryUpload={() => {}}
        onSaveManualPopulation={async () => {}}
        onUploadFile={async () => {}}
        populationFailed={false}
        populationLabel="population-unavailable"
        populationLoading={false}
        upload={data.effectiveUpload}
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
  // Chakra recipes are JSON-compatible; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ useConceptNoteWorkspaceData } =
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
  retryBundle.mockClear();
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

  it("reports whether the city population reached the run context", async () => {
    cityPopulation = { cityId: "city-1", population: 1_000_000, year: 2025 };
    const readyBundle = { status: "ready", source_counts: { ready: 1 } };
    const statusOf = () =>
      ["not-included-in-run", "included-in-run", "bundle-source-pending"].find(
        (key) => container.textContent?.includes(key),
      );
    const refreshButton = () =>
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "population-refresh",
      );

    // A run built before the city profile existed must not claim it.
    contextScenario = {
      uploads: [source("ready", "A")],
      progress_summary: { context_bundle: readyBundle },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(statusOf()).toBe("not-included-in-run");
    expect(container.textContent).toContain("population-refresh-hint");
    await act(async () => refreshButton()!.click());
    expect(retryBundle).toHaveBeenCalledTimes(1);

    contextScenario.progress_summary = {
      context_bundle: { ...readyBundle, status: "building" },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(statusOf()).toBe("bundle-source-pending");
    expect(refreshButton()).toBeUndefined();

    contextScenario.progress_summary = {
      context_bundle: {
        ...readyBundle,
        city_population: { population: 1_000_000, year: 2025 },
      },
    };
    await act(async () => root.render(<ContextHarness />));
    expect(statusOf()).toBe("included-in-run");
    expect(refreshButton()).toBeUndefined();

    // CityCatalyst changed after the build: keep the run figure, offer a refresh.
    cityPopulation = { cityId: "city-1", population: 1_010_000, year: 2026 };
    await act(async () => root.render(<ContextHarness />));
    expect(statusOf()).toBe("included-in-run");
    expect(container.textContent).toContain("population-refresh-outdated");
  });

  it("labels the population with the run figure before the live city record", async () => {
    cityPopulation = { cityId: "city-1", population: 1_010_000, year: 2026 };
    contextScenario = {
      uploads: [],
      progress_summary: {
        context_bundle: {
          status: "ready",
          city_population: { population: 1_000_000, year: 2025 },
        },
      },
      manual_population: null,
    };
    await act(async () => root.render(<PopulationHarness />));
    expect(container.textContent).toBe("1,000,000 residents · 2025");
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
});
