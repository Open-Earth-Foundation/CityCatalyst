import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";

const requireServiceRequest = jest.fn();
const getJob = jest.fn<() => Promise<Record<string, unknown> | null>>();
const getSourceFormat = jest.fn<() => "pdf" | "markdown">();
const getFileBuffer = jest.fn<() => Promise<Buffer>>();

jest.unstable_mockModule(
  "@/backend/agentic/ghgi/stationary-energy/auth",
  () => ({
    requireClimateAdvisorServiceRequest: requireServiceRequest,
  }),
);
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNotePdfOcrJob: getJob,
  getConceptNoteSourceFormat: getSourceFormat,
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { getFileBuffer },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let readHandler: typeof import("@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/structured/route").GET;
const uploadId = "22222222-2222-4222-8222-222222222222";
const body = Buffer.from('{"schema_version":"citycatalyst.structured-document.1"}', "utf8");
const sha256 = createHash("sha256").update(body).digest("hex");

beforeAll(async () => {
  ({ GET: readHandler } =
    await import("@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/structured/route"));
});

describe("authenticated Concept Note structured read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSourceFormat.mockReturnValue("pdf");
    getFileBuffer.mockResolvedValue(body);
    getJob.mockResolvedValue({
      status: "succeeded",
      pageCount: 2,
      annotationMode: "visual_context",
      structuredS3Key: "document.structured.json",
      structuredSha256: sha256,
      structuredSizeBytes: body.byteLength,
      structuredSchemaVersion: "citycatalyst.structured-document.1",
    });
  });

  it("returns verified JSON without a storeable credential", async () => {
    const request = new Request("http://localhost");
    const response = await readHandler(request, {
      session: { user: { id: "owner-user" } },
      params: { uploadId },
    });

    expect(requireServiceRequest).toHaveBeenCalledWith(request);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Structured-S3-Key")).toBe(
      "document.structured.json",
    );
    expect(response.headers.get("X-Structured-SHA256")).toBe(sha256);
    expect(response.headers.get("X-Annotation-Mode")).toBe("visual_context");
    expect(response.headers.get("X-Page-Count")).toBe("2");
    expect(response.headers.get("X-Upload-Id")).toBe(uploadId);
    expect(response.headers.get("X-Amz-Security-Token")).toBeNull();
    expect(await response.text()).toContain("citycatalyst.structured-document.1");
  });

  it("rejects a digest mismatch and a legacy Markdown-only job", async () => {
    getFileBuffer.mockResolvedValue(Buffer.from("tampered"));
    await expect(
      readHandler(new Request("http://localhost"), {
        session: { user: { id: "owner-user" } },
        params: { uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    getJob.mockResolvedValue({
      status: "succeeded",
      pageCount: 2,
      annotationMode: "none",
      resultS3Key: "result.md",
    });
    await expect(
      readHandler(new Request("http://localhost"), {
        session: { user: { id: "owner-user" } },
        params: { uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
