import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const uploadId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const cityId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);
type Row = Record<string, unknown>;
const findAssociation = jest.fn<() => Promise<Row | null>>();
const findSource = jest.fn<() => Promise<Row | null>>();
const findCatalog = jest.fn<() => Promise<Row | null>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const callCa = jest.fn<() => Promise<Response>>();
const getJob = jest.fn<() => Promise<Row | null>>();
const originalServiceKey = process.env.CC_SERVICE_API_KEY;
const serviceKey = "workspace-source-test-service-key";
let association: Row;
let source: Row;
let sourceCatalog: Row;

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      NativeInputCatalog: { findOne: findAssociation, findByPk: findCatalog },
      IngestDocument: { findByPk: findSource },
    },
  },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi: callCa,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getConceptNotePdfOcrJob: getJob,
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let assertAvailable: typeof import("@/backend/document-workspace-sources").assertReusedDocumentSourceAvailable;
let availability: typeof import("@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/availability/route").GET;
const session = { user: { id: userId } };
const context = { session, params: { uploadId } };
function request(headers: Record<string, string> = {}): Request {
  return new Request(
    `http://localhost/api/v1/internal/ca/concept-note-uploads/${uploadId}/availability`,
    {
      headers: {
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": serviceKey,
        ...headers,
      },
    },
  );
}
beforeAll(async () => {
  ({ assertReusedDocumentSourceAvailable: assertAvailable } =
    await import("@/backend/document-workspace-sources"));
  ({ GET: availability } =
    await import("@/app/api/v1/internal/ca/concept-note-uploads/[uploadId]/availability/route"));
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CC_SERVICE_API_KEY = serviceKey;
  association = {
    userId,
    cityId,
    projectId: "project",
    organizationId: "organization",
    availability: "active",
    contentDigest: digest,
    labels: { documentId, runId },
  };
  source = {
    id: documentId,
    cityId,
    projectId: "project",
    organizationId: "organization",
    visibility: "city",
    contentHash: digest,
    catalogId: "source-catalog",
    originalFileName: "plan.pdf",
    markdownReady: true,
    data: Buffer.from("original source bytes"),
  };
  sourceCatalog = { availability: "active" };
  findAssociation.mockImplementation(async () => association);
  findSource.mockImplementation(async () => source);
  findCatalog.mockImplementation(async () => sourceCatalog);
  canAccessCity.mockResolvedValue(undefined);
  callCa.mockImplementation(async () =>
    Response.json({
      upload_id: uploadId,
      run_id: runId,
      status: "processing",
      filename: "plan.pdf",
      source_role: "reference",
      received_at: "2026-11-15T12:00:00Z",
    }),
  );
  getJob.mockResolvedValue({ status: "succeeded", resultSha256: digest });
});
afterAll(() => {
  if (originalServiceKey === undefined) delete process.env.CC_SERVICE_API_KEY;
  else process.env.CC_SERVICE_API_KEY = originalServiceKey;
});

describe("reused document source lifecycle (real pool and target upload authorization helpers)", () => {
  it("allows an active shared source while its authorized target upload is processing", async () => {
    await expect(
      assertAvailable(uploadId, session as never),
    ).resolves.toBeUndefined();
    expect(callCa).toHaveBeenCalledWith({
      path: `/v1/concept-notes/${runId}/uploads/${uploadId}`,
      userId,
    });
    expect(findSource).toHaveBeenCalledWith(documentId);
    expect(canAccessCity).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
    });
  });

  it.each([
    ["withdrawn catalog", {}, { availability: "withdrawn" }],
    ["superseded catalog", {}, { availability: "superseded" }],
    ["private source", { visibility: "run" }, {}],
    ["withdrawn source", { withdrawnAt: new Date() }, {}],
    ["purged source", { bytesPurgedAt: new Date() }, {}],
    ["digest change", { contentHash: "b".repeat(64) }, {}],
    ["different city", { cityId: "different-city" }, {}],
    ["different project", { projectId: "different-project" }, {}],
    [
      "different organization",
      { organizationId: "different-organization" },
      {},
    ],
    ["missing city", { cityId: null }, {}],
  ])(
    "rejects %s before acknowledging source availability",
    async (_label, sourceChange, catalogChange) => {
      Object.assign(source, sourceChange);
      Object.assign(sourceCatalog, catalogChange);
      await expect(
        assertAvailable(uploadId, session as never),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(canAccessCity).not.toHaveBeenCalled();
    },
  );

  it("rejects missing source rows and withdrawn associations", async () => {
    findSource.mockResolvedValueOnce(null);
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    association.availability = "withdrawn";
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects revoked city access", async () => {
    canAccessCity.mockRejectedValueOnce(
      Object.assign(new Error("City access revoked"), { statusCode: 403 }),
    );
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects removed target uploads through the existing authorized CA lookup", async () => {
    callCa.mockResolvedValueOnce(
      Response.json({ detail: "Target was removed" }, { status: 404 }),
    );
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findSource).not.toHaveBeenCalled();
    expect(canAccessCity).not.toHaveBeenCalled();
  });

  it("rejects wrong association owner and malformed reuse labels before target lookup", async () => {
    association.userId = "other-owner";
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    association.userId = userId;
    association.labels = { runId, documentId: "invalid-document-id" };
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(callCa).not.toHaveBeenCalled();
  });

  it("preserves the existing legacy path only when there is no catalog association", async () => {
    findAssociation.mockResolvedValueOnce(null);
    await expect(
      assertAvailable(uploadId, session as never),
    ).resolves.toBeUndefined();
    expect(callCa).not.toHaveBeenCalled();
    expect(findSource).not.toHaveBeenCalled();
    expect(canAccessCity).not.toHaveBeenCalled();
  });
});

describe("catalog-backed original sources without reuse runId", () => {
  beforeEach(() => {
    association.labels = { documentId, visibility: "run" };
    source.visibility = "run";
    source.uploadedByUserId = userId;
  });

  it("allows the original actor's active run-private source after checking current city access", async () => {
    await expect(
      assertAvailable(uploadId, session as never),
    ).resolves.toBeUndefined();
    expect(findSource).toHaveBeenCalledWith(documentId);
    expect(canAccessCity).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
    });
    expect(callCa).not.toHaveBeenCalled();
  });

  it("allows the original source after explicit city promotion", async () => {
    source.visibility = "city";
    await expect(
      assertAvailable(uploadId, session as never),
    ).resolves.toBeUndefined();
    expect(canAccessCity).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["withdrawn original catalog", {}, { availability: "withdrawn" }, {}],
    ["superseded original catalog", {}, { availability: "superseded" }, {}],
    ["withdrawn original source", { withdrawnAt: new Date() }, {}, {}],
    ["purged original bytes", { bytesPurgedAt: new Date() }, {}, {}],
    ["changed original digest", { contentHash: "b".repeat(64) }, {}, {}],
    ["changed original city", { cityId: "other-city" }, {}, {}],
    ["changed original project", { projectId: "other-project" }, {}, {}],
    [
      "changed original organization",
      { organizationId: "other-organization" },
      {},
      {},
    ],
    ["withdrawn original association", {}, {}, { availability: "withdrawn" }],
    ["project visibility", { visibility: "project" }, {}, {}],
    ["organization visibility", { visibility: "org" }, {}, {}],
  ])(
    "rejects %s before artifact metadata is fetched",
    async (_label, sourceChange, catalogChange, associationChange) => {
      Object.assign(source, sourceChange);
      Object.assign(sourceCatalog, catalogChange);
      Object.assign(association, associationChange);
      await expect(
        availability(request(), context as never),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(getJob).not.toHaveBeenCalled();
      expect(callCa).not.toHaveBeenCalled();
    },
  );

  it("rejects both an association belonging to another actor and another actor's private pool row", async () => {
    association.userId = "other-owner";
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findSource).not.toHaveBeenCalled();
    association.userId = userId;
    source.uploadedByUserId = "other-owner";
    await expect(
      assertAvailable(uploadId, session as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(canAccessCity).not.toHaveBeenCalled();
  });

  it("rejects revoked source-city access even for the original actor", async () => {
    canAccessCity.mockRejectedValueOnce(
      Object.assign(new Error("City access revoked"), { statusCode: 403 }),
    );
    await expect(
      availability(request(), context as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getJob).not.toHaveBeenCalled();
  });

  it("rejects an original catalog whose pooled source is missing", async () => {
    findSource.mockResolvedValueOnce(null);
    await expect(
      availability(request(), context as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(getJob).not.toHaveBeenCalled();
  });

  it.each([{}, { documentId: "invalid" }, { documentId, runId: "" }])(
    "does not treat malformed existing catalog labels as legacy: %j",
    async (labels) => {
      association.labels = labels;
      await expect(
        assertAvailable(uploadId, session as never),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(findSource).not.toHaveBeenCalled();
    },
  );

  it("rejects source artifacts removed with the original note even while catalog metadata remains", async () => {
    getJob.mockResolvedValueOnce(null);
    await expect(
      availability(request(), context as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(findSource).toHaveBeenCalledWith(documentId);
    expect(canAccessCity).toHaveBeenCalledTimes(1);
  });
});

describe("internal source availability route with real service authentication", () => {
  it("returns only current Markdown identity after lifecycle and target authorization checks", async () => {
    const response = await availability(request(), context as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      markdown_sha256: digest,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(callCa).toHaveBeenCalledTimes(1);
    expect(canAccessCity).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledWith(uploadId);
  });

  it("rejects missing/invalid service credentials and missing user auth before source queries", async () => {
    for (const headers of [
      { "X-Service-Key": "" },
      { "X-Service-Key": "wrong-key" },
      { "X-Service-Name": "untrusted-service" },
    ]) {
      await expect(
        availability(request(headers), context as never),
      ).rejects.toMatchObject({ statusCode: 401 });
    }
    await expect(
      availability(request(), { ...context, session: null } as never),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(findAssociation).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
  });

  it("aborts on source lifecycle rejection before reading artifact job metadata", async () => {
    sourceCatalog.availability = "withdrawn";
    await expect(
      availability(request(), context as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(getJob).not.toHaveBeenCalled();
  });

  it("aborts when target access was removed before reading artifact job metadata", async () => {
    callCa.mockResolvedValueOnce(
      Response.json({ detail: "Removed target" }, { status: 404 }),
    );
    await expect(
      availability(request(), context as never),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(getJob).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { status: "queued", resultSha256: digest },
    { status: "failed" },
    { status: "succeeded", resultSha256: null },
  ])(
    "rejects an artifact without completed Markdown identity: %j",
    async (job) => {
      getJob.mockResolvedValueOnce(job);
      await expect(
        availability(request(), context as never),
      ).rejects.toMatchObject({ statusCode: 409 });
    },
  );

  it("keeps genuine pre-catalog uploads on the established job-read path", async () => {
    findAssociation.mockResolvedValueOnce(null);
    const response = await availability(request(), context as never);
    expect(response.status).toBe(200);
    expect(callCa).not.toHaveBeenCalled();
    expect(findSource).not.toHaveBeenCalled();
    expect(getJob).toHaveBeenCalledWith(uploadId);
  });
});
