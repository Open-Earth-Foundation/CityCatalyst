import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const cityId = "33333333-3333-4333-8333-333333333333";

const loadRunCity = jest.fn<() => Promise<string>>();
const loadUpload = jest.fn<() => Promise<Record<string, unknown>>>();
const updateUpload = jest.fn<() => Promise<void>>();
const getJob = jest.fn<() => Promise<Record<string, unknown> | null>>();
const retryOcr = jest.fn<() => Promise<"ocr" | "delivery" | "noop">>();
const canAccessCity = jest.fn<() => Promise<void>>();
const loggerInfo = jest.fn();

function normalizeStatus(job: Record<string, unknown>) {
  if (job.status === "queued") {
    return { status: "queued", stage: "ocr", canRetry: false } as const;
  }
  if (job.status === "running") {
    return { status: "processing", stage: "ocr", canRetry: false } as const;
  }
  if (job.status === "failed") {
    return {
      status: "failed",
      stage: "ocr",
      canRetry: true,
      retryKind: "ocr",
      ...(typeof job.errorCode === "string"
        ? { errorCode: job.errorCode }
        : {}),
    } as const;
  }
  if (job.deliveryStatus === "delivered") {
    return { status: "ready", stage: "complete", canRetry: false } as const;
  }
  if (job.deliveryStatus === "failed") {
    return {
      status: "failed",
      stage: "delivery",
      canRetry: true,
      retryKind: "delivery",
      ...(typeof job.deliveryErrorCode === "string"
        ? { errorCode: job.deliveryErrorCode }
        : {}),
    } as const;
  }
  return { status: "processing", stage: "delivery", canRetry: false } as const;
}

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
  loadConceptNoteUpload: loadUpload,
  updateConceptNoteUpload: updateUpload,
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNotePdfOcrJob: getJob,
  normalizeConceptNotePdfOcrStatus: normalizeStatus,
  retryConceptNotePdfOcr: retryOcr,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { info: loggerInfo },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let statusHandler: typeof import("@/app/api/v1/concept-notes/[runId]/uploads/[uploadId]/route").GET;
let retryHandler: typeof import("@/app/api/v1/concept-notes/[runId]/uploads/[uploadId]/retry/route").POST;

const context = {
  session: { user: { id: "owner-user" } },
  params: { runId, uploadId },
};

beforeAll(async () => {
  ({ GET: statusHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/uploads/[uploadId]/route"));
  ({ POST: retryHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/uploads/[uploadId]/retry/route"));
});

describe("Concept Note upload status and retry routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue(cityId);
    canAccessCity.mockResolvedValue(undefined);
    loadUpload.mockResolvedValue({
      uploadId,
      runId,
      status: "failed",
      filename: "plan.pdf",
      sourceLabel: "Climate plan",
      pageCount: null,
      errorCode: "mistral_unavailable",
      receivedAt: "2026-07-31T10:00:00Z",
      completedAt: "2026-07-31T10:01:00Z",
    });
    getJob.mockResolvedValue({
      status: "failed",
      deliveryStatus: "delivered",
      errorCode: "mistral_unavailable",
    });
    updateUpload.mockResolvedValue(undefined);
    retryOcr.mockResolvedValue("ocr");
  });

  it("pinpoints a delivered terminal OCR failure as OCR-retryable", async () => {
    const response = await statusHandler(
      new Request("http://localhost"),
      context,
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        stage: "ocr",
        canRetry: true,
        retryKind: "ocr",
        errorCode: "mistral_unavailable",
      }),
    );
  });

  it("pinpoints a pointer-delivery failure without rerunning OCR", async () => {
    loadUpload.mockResolvedValueOnce({
      uploadId,
      runId,
      status: "processing",
      filename: "plan.pdf",
      receivedAt: "2026-07-31T10:00:00Z",
    });
    getJob.mockResolvedValueOnce({
      status: "succeeded",
      deliveryStatus: "failed",
      deliveryErrorCode: "ca_delivery_rejected",
    });

    const response = await statusHandler(
      new Request("http://localhost"),
      context,
    );

    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        stage: "delivery",
        canRetry: true,
        retryKind: "delivery",
        errorCode: "ca_delivery_rejected",
      }),
    );
  });

  it("marks pre-queue upload failures as non-retryable through the OCR endpoint", async () => {
    getJob.mockResolvedValueOnce(null);
    loadUpload.mockResolvedValueOnce({
      uploadId,
      runId,
      status: "failed",
      filename: "plan.pdf",
      errorCode: "source_storage_failed",
      receivedAt: "2026-07-31T10:00:00Z",
    });

    const response = await statusHandler(
      new Request("http://localhost"),
      context,
    );
    const payload = await response.json();

    expect(payload).toEqual(
      expect.objectContaining({
        status: "failed",
        stage: "upload",
        canRetry: false,
        errorCode: "source_storage_failed",
      }),
    );
    expect(payload).not.toHaveProperty("retryKind");
  });

  it("allows OCR retry after the terminal failure was delivered to CA", async () => {
    const requestId = "cc-parent-request-123";
    const response = await retryHandler(
      new Request("http://localhost", {
        headers: { "x-request-id": requestId },
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      uploadId,
      status: "queued",
      stage: "ocr",
      retryKind: "ocr",
    });
    expect(updateUpload).toHaveBeenCalledWith(
      expect.objectContaining({ action: "retry", uploadId }),
    );
    expect(retryOcr).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        deliveryStatus: "delivered",
      }),
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      {
        requestId,
        userId: "owner-user",
        runId,
        uploadId,
        retryKind: "ocr",
        acceptedRetryKind: "ocr",
      },
      "Concept Note upload retry processed",
    );
  });

  it("keeps delivery retry separate from successful OCR", async () => {
    loadUpload.mockResolvedValueOnce({
      uploadId,
      runId,
      status: "failed",
      filename: "plan.pdf",
      receivedAt: "2026-07-31T10:00:00Z",
    });
    getJob.mockResolvedValueOnce({
      status: "succeeded",
      deliveryStatus: "failed",
      deliveryErrorCode: "ca_delivery_rejected",
    });
    retryOcr.mockResolvedValueOnce("delivery");

    const response = await retryHandler(
      new Request("http://localhost"),
      context,
    );

    expect(await response.json()).toEqual({
      uploadId,
      status: "processing",
      stage: "delivery",
      retryKind: "delivery",
    });
  });

  it("still rejects an upload whose successful OCR was delivered", async () => {
    loadUpload.mockResolvedValueOnce({
      uploadId,
      runId,
      status: "ready",
      filename: "plan.pdf",
      receivedAt: "2026-07-31T10:00:00Z",
    });
    getJob.mockResolvedValueOnce({
      status: "succeeded",
      deliveryStatus: "delivered",
    });

    await expect(
      retryHandler(new Request("http://localhost"), context),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(updateUpload).not.toHaveBeenCalled();
    expect(retryOcr).not.toHaveBeenCalled();
  });
});
