import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const loadRunCity = jest.fn<() => Promise<string>>();
const updateUpload = jest.fn<() => Promise<void>>();
const putFile = jest.fn<() => Promise<void>>();
const enqueue =
  jest.fn<(uploadId: string) => Promise<Record<string, unknown>>>();
const normalizeStatus = jest.fn<
  (job: Record<string, unknown>) => {
    status: "queued" | "processing" | "ready" | "failed";
    stage: "ocr" | "delivery" | "complete";
    canRetry: boolean;
    retryKind?: "ocr" | "delivery";
  }
>();
const callConceptNoteApi =
  jest.fn<(request: { body?: { upload_id?: string } }) => Promise<Response>>();
const canAccessCity = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
  updateConceptNoteUpload: updateUpload,
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { putFile },
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  conceptNotePdfSourceKey: (id: string) =>
    `pdf-ocr/sources/concept_note_upload/${id}/source.pdf`,
  enqueueConceptNotePdfOcr: enqueue,
  normalizeConceptNotePdfOcrStatus: normalizeStatus,
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let uploadHandler: typeof import("@/app/api/v1/concept-notes/[runId]/uploads/route").POST;

beforeAll(async () => {
  ({ POST: uploadHandler } =
    await import("@/app/api/v1/concept-notes/[runId]/uploads/route"));
});

function requestWithFile(
  bytes: string,
  options: { name?: string; type?: string } = {},
): Request {
  const form = new FormData();
  form.set(
    "file",
    new File([bytes], options.name || "plan.pdf", {
      type: options.type || "application/pdf",
    }),
  );
  form.set("sourceLabel", "Climate plan");
  return new Request(`http://localhost/api/v1/concept-notes/${runId}/uploads`, {
    method: "POST",
    body: form,
  });
}

const context = {
  session: { user: { id: "owner-user" } },
  params: { runId },
};

describe("Concept Note PDF upload route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue("33333333-3333-4333-8333-333333333333");
    canAccessCity.mockResolvedValue(undefined);
    callConceptNoteApi.mockImplementation(async (request) =>
      Response.json({
        upload_id: request.body?.upload_id,
        status: "queued",
      }),
    );
    putFile.mockResolvedValue(undefined);
    enqueue.mockResolvedValue({ status: "queued", deliveryStatus: "pending" });
    normalizeStatus.mockImplementation((job) => {
      if (job.status === "succeeded" && job.deliveryStatus === "delivered") {
        return { status: "ready", stage: "complete", canRetry: false };
      }
      return { status: "queued", stage: "ocr", canRetry: false };
    });
    updateUpload.mockResolvedValue(undefined);
  });

  it("authorizes the run and city before consuming multipart bytes", async () => {
    loadRunCity.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), {
        statusCode: 403,
      }),
    );
    const formData = jest.fn<() => Promise<FormData>>();
    const request = {
      headers: new Headers(),
      formData,
    } as unknown as Request;

    await expect(uploadHandler(request, context)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(formData).not.toHaveBeenCalled();
  });

  it("registers CA first, stores the source, and queues one UUID v4 job", async () => {
    const response = await uploadHandler(
      requestWithFile("%PDF-1.7\ncontent"),
      context,
    );

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({
      uploadId: expect.any(String),
      status: "queued",
      stage: "ocr",
      canRetry: false,
    });
    expect(payload.uploadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/uploads`,
        method: "POST",
        body: expect.objectContaining({ upload_id: payload.uploadId }),
      }),
    );
    expect(putFile).toHaveBeenCalledWith(
      `pdf-ocr/sources/concept_note_upload/${payload.uploadId}/source.pdf`,
      expect.any(Buffer),
      "application/pdf",
    );
    expect(enqueue).toHaveBeenCalledWith(payload.uploadId);
  });

  it("assigns a fresh identity to repeated initial uploads", async () => {
    const first = await uploadHandler(
      requestWithFile("%PDF-1.7\nidentical"),
      context,
    );
    const second = await uploadHandler(
      requestWithFile("%PDF-1.7\nidentical"),
      context,
    );

    const firstPayload = await first.json();
    const secondPayload = await second.json();
    expect(secondPayload.uploadId).not.toBe(firstPayload.uploadId);
    expect(callConceptNoteApi.mock.calls[0][0].body?.upload_id).not.toBe(
      callConceptNoteApi.mock.calls[1][0].body?.upload_id,
    );
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("rejects MIME, empty, and signature failures before CA registration", async () => {
    await expect(
      uploadHandler(
        requestWithFile("%PDF-1.7", { type: "text/plain" }),
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 415 });
    await expect(
      uploadHandler(requestWithFile(""), context),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      uploadHandler(requestWithFile("not a pdf"), context),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });

  it("does not store or queue when CA row creation fails", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ code: "run_not_found" }, { status: 404 }),
    );
    const response = await uploadHandler(
      requestWithFile("%PDF-1.7\ncontent"),
      context,
    );

    expect(response.status).toBe(404);
    expect(putFile).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("retains the stored source and marks CA failed when enqueueing fails", async () => {
    enqueue.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      uploadHandler(requestWithFile("%PDF-1.7\ncontent"), context),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(updateUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "failed",
        errorCode: "ocr_enqueue_failed",
      }),
    );
  });
});
