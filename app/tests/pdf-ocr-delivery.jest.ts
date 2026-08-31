import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { PdfOcrJob } from "@/models/PdfOcrJob";

const issueToken = jest.fn<() => Promise<{ access_token: string }>>();
const getSourceFormat = jest.fn<() => "pdf" | "markdown">();

jest.unstable_mockModule("@/models", () => ({
  db: { models: { PdfOcrJob: { findAll: jest.fn() } } },
}));
jest.unstable_mockModule("@/backend/chat/climate-advisor", () => ({
  issueClimateAdvisorUserToken: issueToken,
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNoteSourceFormat: getSourceFormat,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn: jest.fn() },
}));

let deliverPdfOcrJob: typeof import("@/backend/PdfOcrDeliveryService").deliverPdfOcrJob;
let serializeMarkdownDeliveryPayload: typeof import("@/backend/PdfOcrDeliveryService").serializeMarkdownDeliveryPayload;
let resolvePdfOcrDeliverySource: typeof import("@/backend/PdfOcrDeliveryService").resolvePdfOcrDeliverySource;

const job = {
  status: "succeeded",
  resultS3Key: "result.md",
  resultSha256: "a".repeat(64),
  pageCount: 1,
} as PdfOcrJob;
const source = {
  runId: "11111111-1111-4111-8111-111111111111",
  uploadId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  filename: "plan.pdf",
  sourceLabel: "Plan",
  sourceFormat: "pdf" as const,
};

beforeAll(async () => {
  ({
    deliverPdfOcrJob,
    serializeMarkdownDeliveryPayload,
    resolvePdfOcrDeliverySource,
  } = await import("@/backend/PdfOcrDeliveryService"));
});

describe("PDF OCR delivery", () => {
  beforeEach(() => {
    getSourceFormat.mockReturnValue("pdf");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete process.env.CA_BASE_URL;
    delete process.env.CC_SERVICE_API_KEY;
  });

  it.each([
    ["pdf", "plan.pdf", 1, job, source],
    [
      "markdown",
      "plan.md",
      null,
      { ...job, model: "direct_markdown", pageCount: null } as PdfOcrJob,
      { ...source, filename: "plan.md", sourceFormat: "markdown" as const },
    ],
  ] as const)(
    "serializes %s delivery metadata",
    (sourceFormat, filename, pageCount, testJob, testSource) => {
      getSourceFormat.mockReturnValue(sourceFormat);
      const body = JSON.parse(
        serializeMarkdownDeliveryPayload(testJob, testSource),
      );
      expect(body).toEqual({
        markdown_s3_key: "result.md",
        filename,
        source_label: "Plan",
        source_format: sourceFormat,
        page_count: pageCount,
        sha256: "a".repeat(64),
      });
    },
  );

  it("accepts idempotent 202 responses without changing OCR state", async () => {
    process.env.CA_BASE_URL = "http://climate-advisor";
    issueToken.mockResolvedValue({ access_token: "token" });
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("", { status: 202 }));
    await expect(deliverPdfOcrJob(job, source)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/concept-notes/${source.runId}/uploads/${source.uploadId}/markdown`,
    );
    expect(job.status).toBe("succeeded");
  });

  it.each([
    [409, false, "markdown_identity_conflict"],
    [422, false, "ca_delivery_rejected"],
    [429, true, "ca_delivery_transient_error"],
    [503, true, "ca_delivery_transient_error"],
  ])(
    "classifies CA status %s independently",
    async (status, retryable, code) => {
      process.env.CA_BASE_URL = "http://climate-advisor";
      issueToken.mockResolvedValue({ access_token: "token" });
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("", { status }));
      await expect(deliverPdfOcrJob(job, source)).rejects.toMatchObject({
        retryable,
        code,
      });
    },
  );

  it("delivers a terminal OCR failure without requiring Markdown", async () => {
    process.env.CA_BASE_URL = "http://climate-advisor";
    issueToken.mockResolvedValue({ access_token: "token" });
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    await deliverPdfOcrJob(
      {
        ...job,
        status: "failed",
        errorCode: "mistral_unavailable",
        resultS3Key: null,
      } as PdfOcrJob,
      source,
    );
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/concept-notes/${source.runId}/uploads/${source.uploadId}/failed`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      error_code: "mistral_unavailable",
    });
  });

  it("resolves source format through reverse service authentication", async () => {
    process.env.CA_BASE_URL = "http://climate-advisor";
    process.env.CC_SERVICE_API_KEY = "shared-key";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        upload_id: source.uploadId,
        run_id: source.runId,
        user_id: source.userId,
        filename: "plan.md",
        source_label: source.sourceLabel,
        source_format: "markdown",
      }),
    );

    await expect(
      resolvePdfOcrDeliverySource({
        ...job,
        sourceType: "concept_note_upload",
        sourceId: source.uploadId,
      } as PdfOcrJob),
    ).resolves.toEqual({
      ...source,
      filename: "plan.md",
      sourceFormat: "markdown",
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/concept-note-uploads/${source.uploadId}/delivery-context`,
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      "X-CC-Service-Key": "shared-key",
    });
  });
});
