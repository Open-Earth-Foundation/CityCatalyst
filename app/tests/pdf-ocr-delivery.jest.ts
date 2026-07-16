import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const getTextFile = jest.fn<any>();
const issueToken = jest.fn<any>();

jest.unstable_mockModule("@/models", () => ({
  db: { models: { PdfOcrJob: { findAll: jest.fn() } } },
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { getTextFile },
}));
jest.unstable_mockModule("@/backend/chat/climate-advisor", () => ({
  issueClimateAdvisorUserToken: issueToken,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn: jest.fn() },
}));

let deliverPdfOcrJob: typeof import("@/backend/PdfOcrDeliveryService").deliverPdfOcrJob;
let serializeMarkdownDeliveryPayload: typeof import("@/backend/PdfOcrDeliveryService").serializeMarkdownDeliveryPayload;

const job = {
  status: "succeeded",
  resultS3Key: "result.md",
  resultSha256: "a".repeat(64),
  pageCount: 1,
} as any;
const source = {
  runId: "11111111-1111-4111-8111-111111111111",
  uploadId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  filename: "plan.pdf",
  sourceLabel: "Plan",
};

beforeAll(async () => {
  ({ deliverPdfOcrJob, serializeMarkdownDeliveryPayload } = await import(
    "@/backend/PdfOcrDeliveryService"
  ));
});

describe("PDF OCR delivery", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete process.env.CA_BASE_URL;
  });

  it("serializes the documented payload and rejects requests over 20 MiB", () => {
    const body = JSON.parse(
      serializeMarkdownDeliveryPayload("<!-- page: 1 -->\n# Plan", job, source),
    );
    expect(body).toEqual({
      markdown: "<!-- page: 1 -->\n# Plan",
      filename: "plan.pdf",
      source_label: "Plan",
      page_count: 1,
      sha256: "a".repeat(64),
    });
    expect(() =>
      serializeMarkdownDeliveryPayload(
        "x".repeat(20 * 1024 * 1024),
        job,
        source,
      ),
    ).toThrow("exceeds the configured maximum");
  });

  it("accepts idempotent 202 responses without changing OCR state", async () => {
    process.env.CA_BASE_URL = "http://climate-advisor";
    getTextFile.mockResolvedValue("<!-- page: 1 -->\n# Plan");
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
      getTextFile.mockResolvedValue("<!-- page: 1 -->\n# Plan");
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
});
