import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const loadRunCity =
  jest.fn<
    () => Promise<{
      cityId: string;
      initialUploads: Array<{
        upload_id: string;
        filename: string;
        sha256: string;
      }>;
    }>
  >();
const updateUpload = jest.fn<() => Promise<void>>();
const putFile = jest.fn<() => Promise<void>>();
const enqueue =
  jest.fn<(uploadId: string) => Promise<Record<string, unknown>>>();
const registerMarkdown =
  jest.fn<
    (uploadId: string, markdown: string) => Promise<Record<string, unknown>>
  >();
const retryOcr =
  jest.fn<
    (job: Record<string, unknown>) => Promise<"ocr" | "delivery" | "noop">
  >();
const triggerProcessing = jest.fn<() => void>();
const normalizeMarkdown = jest.fn<(markdown: string) => string>();
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
  loadConceptNoteUploadRun: loadRunCity,
  updateConceptNoteUpload: updateUpload,
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { putFile },
}));
jest.unstable_mockModule(
  "@/backend/ConceptNoteSourceProcessingService",
  () => ({
    triggerConceptNoteSourceProcessing: triggerProcessing,
  }),
);
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  conceptNotePdfSourceKey: (id: string) =>
    `pdf-ocr/sources/concept_note_upload/${id}/source.pdf`,
  enqueueConceptNotePdfOcr: enqueue,
  normalizeConceptNoteMarkdown: normalizeMarkdown,
  registerConceptNoteMarkdownUpload: registerMarkdown,
  normalizeConceptNotePdfOcrStatus: normalizeStatus,
  retryConceptNotePdfOcr: retryOcr,
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
  bytes: string | Uint8Array,
  options: { name?: string; type?: string } = {},
): Request {
  const form = new FormData();
  form.set(
    "file",
    new File([bytes], options.name || "plan.pdf", {
      type: options.type ?? "application/pdf",
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

describe("Concept Note source upload route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadRunCity.mockResolvedValue({
      cityId: "33333333-3333-4333-8333-333333333333",
      initialUploads: [],
    });
    canAccessCity.mockResolvedValue(undefined);
    callConceptNoteApi.mockImplementation(async (request) =>
      Response.json({
        upload_id: request.body?.upload_id,
        status: "queued",
      }),
    );
    putFile.mockResolvedValue(undefined);
    enqueue.mockResolvedValue({ status: "queued", deliveryStatus: "pending" });
    normalizeMarkdown.mockImplementation((markdown) =>
      markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"),
    );
    registerMarkdown.mockResolvedValue({
      status: "succeeded",
      deliveryStatus: "pending",
    });
    normalizeStatus.mockImplementation((job) => {
      if (job.status === "succeeded" && job.deliveryStatus === "delivered") {
        return { status: "ready", stage: "complete", canRetry: false };
      }
      if (job.status === "succeeded") {
        return { status: "processing", stage: "delivery", canRetry: false };
      }
      if (job.status === "failed") {
        return {
          status: "failed",
          stage: "ocr",
          canRetry: true,
          retryKind: "ocr",
        };
      }
      return { status: "queued", stage: "ocr", canRetry: false };
    });
    retryOcr.mockImplementation(async (job) => {
      job.status = "queued";
      return "ocr";
    });
    updateUpload.mockResolvedValue(undefined);
  });

  async function replayRequest(uploadId: string): Promise<Request> {
    const { createHash } = await import("node:crypto");
    const content = "%PDF-1.7\ncontent";
    loadRunCity.mockResolvedValue({
      cityId: "33333333-3333-4333-8333-333333333333",
      initialUploads: [
        {
          upload_id: uploadId,
          filename: "plan.pdf",
          sha256: createHash("sha256").update(content).digest("hex"),
        },
      ],
    });
    const form = new FormData();
    form.set(
      "file",
      new File([content], "plan.pdf", { type: "application/pdf" }),
    );
    form.set("initialUploadId", uploadId);
    return new Request("http://localhost/upload", {
      method: "POST",
      body: form,
    });
  }

  function acceptedCalls(uploadId: string) {
    return callConceptNoteApi.mock.calls.filter(
      ([request]) =>
        (request as { path?: string }).path ===
        `/v1/concept-notes/${runId}/initial-uploads/${uploadId}/accepted`,
    );
  }

  it("re-queues a failed CA row before storing and acknowledging a replay", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    callConceptNoteApi.mockImplementation(async (request) =>
      Response.json({
        upload_id: request.body?.upload_id ?? uploadId,
        status: request.body?.upload_id ? "failed" : "queued",
      }),
    );
    const order: string[] = [];
    updateUpload.mockImplementation(async () => {
      order.push("retry");
    });
    putFile.mockImplementation(async () => {
      order.push("store");
    });

    const response = await uploadHandler(
      await replayRequest(uploadId),
      context,
    );

    expect(response.status).toBe(202);
    expect(updateUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId, action: "retry" }),
    );
    expect(order).toEqual(["retry", "store"]);
    expect(acceptedCalls(uploadId)).toHaveLength(1);
  });

  it("does not acknowledge a replay when the CA retry fails", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    callConceptNoteApi.mockImplementation(async (request) =>
      Response.json({ upload_id: request.body?.upload_id, status: "failed" }),
    );
    updateUpload.mockRejectedValueOnce(
      Object.assign(new Error("unavailable"), { statusCode: 503 }),
    );

    await expect(
      uploadHandler(await replayRequest(uploadId), context),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(putFile).not.toHaveBeenCalled();
    expect(acceptedCalls(uploadId)).toHaveLength(0);
  });

  it("re-queues a failed CC job before acknowledging a replay", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const failedJob = { status: "failed", deliveryStatus: "pending" };
    enqueue.mockResolvedValueOnce(failedJob);

    const response = await uploadHandler(
      await replayRequest(uploadId),
      context,
    );

    expect(retryOcr).toHaveBeenCalledWith(failedJob);
    expect(retryOcr.mock.invocationCallOrder[0]).toBeLessThan(
      callConceptNoteApi.mock.invocationCallOrder.at(-1) ?? 0,
    );
    expect(acceptedCalls(uploadId)).toHaveLength(1);
    expect(await response.json()).toMatchObject({ status: "queued" });
  });

  it("does not acknowledge a replay when the CC job cannot be re-queued", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    enqueue.mockResolvedValueOnce({
      status: "failed",
      deliveryStatus: "pending",
    });
    retryOcr.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      uploadHandler(await replayRequest(uploadId), context),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(acceptedCalls(uploadId)).toHaveLength(0);
    expect(updateUpload).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("replays the same upload after a lost response and confirms durable handoff", async () => {
    const { createHash } = await import("node:crypto");
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const content = "%PDF-1.7\ncontent";
    loadRunCity.mockResolvedValue({
      cityId: "33333333-3333-4333-8333-333333333333",
      initialUploads: [
        {
          upload_id: uploadId,
          filename: "plan.pdf",
          sha256: createHash("sha256").update(content).digest("hex"),
        },
      ],
    });
    const request = () => {
      const form = new FormData();
      form.set(
        "file",
        new File([content], "plan.pdf", { type: "application/pdf" }),
      );
      form.set("initialUploadId", uploadId);
      return new Request("http://localhost/upload", {
        method: "POST",
        body: form,
      });
    };
    const first = await uploadHandler(request(), context);
    const second = await uploadHandler(request(), context);
    expect((await first.json()).uploadId).toBe(uploadId);
    expect((await second.json()).uploadId).toBe(uploadId);
    expect(enqueue.mock.calls.map(([id]) => id)).toEqual([uploadId, uploadId]);
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/initial-uploads/${uploadId}/accepted`,
        method: "POST",
      }),
    );
    const changed = new FormData();
    changed.set(
      "file",
      new File(["%PDF-different"], "plan.pdf", { type: "application/pdf" }),
    );
    changed.set("initialUploadId", uploadId);
    await expect(
      uploadHandler(
        new Request("http://localhost/upload", {
          method: "POST",
          body: changed,
        }),
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(enqueue).toHaveBeenCalledTimes(2);
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
      filename: "plan.pdf",
      sourceLabel: "Climate plan",
    });
    expect(payload.uploadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/uploads`,
        method: "POST",
        body: expect.objectContaining({
          upload_id: payload.uploadId,
          source_format: "pdf",
        }),
      }),
    );
    expect(putFile).toHaveBeenCalledWith(
      `pdf-ocr/sources/concept_note_upload/${payload.uploadId}/source.pdf`,
      expect.any(Buffer),
      "application/pdf",
    );
    expect(enqueue).toHaveBeenCalledWith(payload.uploadId);
    expect(triggerProcessing).toHaveBeenCalledTimes(1);
  });

  it("assigns a fresh identity to uploads without a persisted initial identity", async () => {
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

  it("stores Markdown and prepares direct delivery without queueing OCR", async () => {
    const response = await uploadHandler(
      requestWithFile("# Plan\n## Need", {
        name: "plan.md",
        type: "text/markdown",
      }),
      context,
    );

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({
      uploadId: expect.any(String),
      status: "processing",
      stage: "delivery",
      canRetry: false,
      filename: "plan.md",
      sourceLabel: "Climate plan",
    });
    expect(putFile).not.toHaveBeenCalled();
    expect(registerMarkdown).toHaveBeenCalledWith(
      payload.uploadId,
      "# Plan\n## Need",
    );
    expect(callConceptNoteApi).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          upload_id: payload.uploadId,
          source_format: "markdown",
        }),
      }),
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(triggerProcessing).toHaveBeenCalledTimes(1);
  });

  it("accepts .md uploads with an empty MIME type", async () => {
    const response = await uploadHandler(
      requestWithFile("# Plan", {
        name: "plan.md",
        type: "",
      }),
      context,
    );

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(registerMarkdown).toHaveBeenCalledWith(payload.uploadId, "# Plan");
  });

  it.each([
    [
      "wrong PDF MIME type",
      requestWithFile("%PDF-1.7", { type: "text/plain" }),
      415,
    ],
    ["empty PDF", requestWithFile(""), 422],
    ["invalid PDF signature", requestWithFile("not a pdf"), 422],
    [
      "unsupported Markdown MIME type",
      requestWithFile("# Draft", { name: "plan.md", type: "application/json" }),
      415,
    ],
    [
      "non-UTF-8 Markdown",
      requestWithFile(new Uint8Array([0xff, 0xfe, 0x61]), {
        name: "plan.md",
        type: "text/markdown",
      }),
      422,
    ],
  ] as const)(
    "rejects %s before CA registration",
    async (_case, request, statusCode) => {
      await expect(uploadHandler(request, context)).rejects.toMatchObject({
        statusCode,
      });
      expect(callConceptNoteApi).not.toHaveBeenCalled();
    },
  );

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

  it("marks CA failed when direct Markdown registration fails", async () => {
    registerMarkdown.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      uploadHandler(
        requestWithFile("# Draft", {
          name: "plan.md",
          type: "text/markdown",
        }),
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(updateUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "failed",
        errorCode: "markdown_registration_failed",
      }),
    );
  });

  it("rejects invalid Markdown content before CA registration", async () => {
    normalizeMarkdown.mockImplementationOnce(() => {
      throw new Error("Markdown source must contain non-whitespace text");
    });

    await expect(
      uploadHandler(
        requestWithFile("# Draft", {
          name: "plan.md",
          type: "text/markdown",
        }),
        context,
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(callConceptNoteApi).not.toHaveBeenCalled();
  });
});
