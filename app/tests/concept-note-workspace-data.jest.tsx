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
import { createRoot, type Root } from "react-dom/client";

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
  useTranslation: () => ({ t: (key: string) => key }),
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
      data: {
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
    useUploadConceptNoteSourceMutation: () => [jest.fn(), { isLoading: false }],
  },
}));

let useConceptNoteWorkspaceData: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data").useConceptNoteWorkspaceData;
let container: HTMLDivElement;
let root: Root;

function Harness() {
  const { retryActiveUpload } = useConceptNoteWorkspaceData({
    cityId: "city-1",
    lng: "en",
    runId: "run-1",
  });

  return <button data-testid="retry" onClick={retryActiveUpload} />;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ useConceptNoteWorkspaceData } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-data"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useConceptNoteWorkspaceData", () => {
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
