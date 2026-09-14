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
  "progress_summary" | "uploads"
> | null = null;
let currentUpload: ConceptNoteUploadResponse | undefined;
let uploading = false;
const t = (key: string) => key;
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

jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetCityQuery: () => ({ data: { name: "Test City" } }),
    useGetConceptNoteApplicationContextQuery: () => ({
      data: undefined,
      isError: false,
      isLoading: false,
    }),
    useGetConceptNoteDraftQuery: () => ({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: jest.fn(async () => undefined),
    }),
    useGetConceptNoteRunQuery: () => ({
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
    }),
    useGetConceptNoteUploadStatusQuery: () => ({
      currentData: currentUpload,
      data: undefined,
      isError: false,
    }),
    useGetInventoryByCityIdQuery: () => ({ data: undefined }),
    useGetMostRecentCityPopulationQuery: () => ({ data: undefined }),
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
      jest.fn(),
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
        lng="en"
        onOpenContext={() => {}}
        threadId="thread-1"
        editScope={{ kind: "auto" }}
        edits={{ loadProposal: async () => {} } as never}
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

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra recipes are JSON-compatible; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ useConceptNoteWorkspaceData } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data"));
  ({ ConceptNoteChatPanel: Panel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  contextScenario = null;
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
    expect(refetchRun).toHaveBeenCalledTimes(1);
  });
});
