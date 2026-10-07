import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const loadUpload = jest.fn<() => Promise<Record<string, unknown>>>();
const getJob = jest.fn<() => Promise<Record<string, unknown> | null>>();
const normalizeStatus =
  jest.fn<(job: Record<string, unknown>) => Record<string, unknown>>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteUpload: loadUpload,
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNotePdfOcrJob: getJob,
  normalizeConceptNotePdfOcrStatus: normalizeStatus,
}));

let loadConceptNoteUploadStatus: typeof import("@/backend/ConceptNoteUploadStatusService").loadConceptNoteUploadStatus;

beforeAll(async () => {
  ({ loadConceptNoteUploadStatus } =
    await import("@/backend/ConceptNoteUploadStatusService"));
});

beforeEach(() => {
  jest.clearAllMocks();
  loadUpload.mockResolvedValue({
    uploadId: "upload-1",
    runId: "run-1",
    status: "processing",
    filename: "plan.pdf",
    sourceLabel: "Plan",
    pageCount: null,
    receivedAt: "2026-09-13T10:00:00Z",
    completedAt: null,
  });
});

describe("loadConceptNoteUploadStatus", () => {
  it("uses worker failure details while upload processing is active", async () => {
    getJob.mockResolvedValue({ status: "failed" });
    normalizeStatus.mockReturnValue({
      status: "failed",
      stage: "ocr",
      canRetry: true,
      retryKind: "ocr",
      errorCode: "ocr_failed",
    });

    await expect(
      loadConceptNoteUploadStatus({
        runId: "run-1",
        uploadId: "upload-1",
        userId: "owner-user",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        stage: "ocr",
        canRetry: true,
        retryKind: "ocr",
        errorCode: "ocr_failed",
      }),
    );
  });

  it("treats persisted ready state as authoritative over stale worker state", async () => {
    loadUpload.mockResolvedValueOnce({
      uploadId: "upload-1",
      runId: "run-1",
      status: "ready",
      filename: "plan.pdf",
      receivedAt: "2026-09-13T10:00:00Z",
    });
    getJob.mockResolvedValue({ status: "failed" });
    normalizeStatus.mockReturnValue({
      status: "failed",
      stage: "ocr",
      canRetry: true,
      retryKind: "ocr",
    });

    const result = await loadConceptNoteUploadStatus({
      runId: "run-1",
      uploadId: "upload-1",
      userId: "owner-user",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ready",
        stage: "complete",
        canRetry: false,
      }),
    );
    expect(result).not.toHaveProperty("retryKind");
  });
});
