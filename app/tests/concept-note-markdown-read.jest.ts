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
const getFileBuffer = jest.fn<() => Promise<Buffer>>();

jest.unstable_mockModule(
  "@/backend/agentic/ghgi/stationary-energy/auth",
  () => ({
    requireClimateAdvisorServiceRequest: requireServiceRequest,
  }),
);
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNotePdfOcrJob: getJob,
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { getFileBuffer },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let readHandler: typeof import("@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/markdown/route").GET;
const uploadId = "22222222-2222-4222-8222-222222222222";
const markdown = Buffer.from("<!-- page: 1 -->\n# Plan", "utf8");
const sha256 = createHash("sha256").update(markdown).digest("hex");

beforeAll(async () => {
  ({ GET: readHandler } = await import(
    "@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/markdown/route"
  ));
});

describe("authenticated Concept Note Markdown read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getJob.mockResolvedValue({
      status: "succeeded",
      resultS3Key: "result.md",
      resultSha256: sha256,
      pageCount: 1,
    });
    getFileBuffer.mockResolvedValue(markdown);
  });

  it("streams only a successful artifact with immutable metadata headers", async () => {
    const request = new Request("http://localhost");
    const response = await readHandler(request, {
      session: { user: { id: "owner-user" } },
      params: { uploadId },
    });

    expect(requireServiceRequest).toHaveBeenCalledWith(request);
    expect(response.headers.get("X-Markdown-S3-Key")).toBe("result.md");
    expect(response.headers.get("X-Markdown-SHA256")).toBe(sha256);
    expect(response.headers.get("X-Page-Count")).toBe("1");
    expect(await response.text()).toContain("# Plan");
  });

  it("rejects missing user auth and a changed stored digest", async () => {
    await expect(
      readHandler(new Request("http://localhost"), {
        session: null,
        params: { uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    getFileBuffer.mockResolvedValue(Buffer.from("tampered"));
    await expect(
      readHandler(new Request("http://localhost"), {
        session: { user: { id: "owner-user" } },
        params: { uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
