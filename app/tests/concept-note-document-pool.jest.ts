import { createHash } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Op } from "sequelize";

const runId = "11111111-1111-4111-8111-111111111111";
const cityId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
type Row = Record<string, unknown>;
type Query = {
  where: Record<string | symbol, unknown>;
  include?: Array<{ where: Row }>;
  attributes?: string[];
  limit?: number;
  offset?: number;
  defaults?: Row;
};
const documents = new Map<string, Row>();
const catalogs = new Map<string, Row>();
const jobs = new Map<string, Row>();
const canAccessCity = jest.fn<() => Promise<{ organizationId: string }>>();
const putFile = jest.fn<() => Promise<void>>();
const putTextFile = jest.fn<() => Promise<void>>();
const readBytes = jest.fn<() => Promise<Buffer | null>>();
const trigger = jest.fn();
const moduleEnabled = jest.fn<() => boolean>();
const createDocument = jest.fn();
const findDocuments = jest.fn<(query: Query) => Promise<Row[]>>();
const findDocument = jest.fn<(query: Query) => Promise<Row | null>>();
const createUpload =
  jest.fn<
    (request: {
      path: string;
      method?: string;
      body?: Row;
    }) => Promise<Response>
  >();
const pdfFindOrCreate = jest.fn<(query: Query) => Promise<[Row, boolean]>>();
let catalogCounter = 0;

function saved(data: Row): Row {
  const row = { ...data };
  row.update = async (values: Row) => Object.assign(row, values);
  return row;
}
function visibleRows(query: Query): Row[] {
  return [...documents.values()].filter((row) => {
    const catalog = catalogs.get(row.catalogId as string);
    return (
      (!query.where.id || row.id === query.where.id) &&
      row.cityId === query.where.cityId &&
      row.visibility === query.where.visibility &&
      !row.withdrawnAt &&
      !row.bytesPurgedAt &&
      catalog?.availability === "active" &&
      (!row.projectId || row.projectId === "project-id") &&
      (!row.organizationId || row.organizationId === "org-id") &&
      /\.(pdf|md|markdown)$/i.test(row.originalFileName as string)
    );
  });
}

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      City: { findByPk: async () => ({ cityId, projectId: "project-id" }) },
      IngestDocument: {
        findAll: findDocuments,
        findOne: findDocument,
        findByPk: async (id: string) => documents.get(id) ?? null,
        create: createDocument,
      },
      NativeInputCatalog: {
        findByPk: async (id: string) => catalogs.get(id) ?? null,
        findOne: async (query: Query) =>
          [...catalogs.values()].find(
            (row) =>
              row.sourceType === query.where.sourceType &&
              row.sourceId === query.where.sourceId &&
              row.availability !== "withdrawn",
          ) ?? null,
        create: async (data: Row) => {
          const row = saved({ id: `association-${++catalogCounter}`, ...data });
          catalogs.set(row.id as string, row);
          return row;
        },
      },
      PdfOcrJob: {
        findOne: async (query: Query) =>
          jobs.get(query.where.sourceId as string) ?? null,
        findOrCreate: pdfFindOrCreate,
      },
    },
  },
}));
jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi: createUpload,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: { putFile, putTextFile, resolveImportedFileBuffer: readBytes },
}));
jest.unstable_mockModule(
  "@/backend/ConceptNoteSourceProcessingService",
  () => ({ triggerConceptNoteSourceProcessing: trigger }),
);
jest.unstable_mockModule("@/backend/MistralOcrService", () => ({
  convertPdfUrlToMarkdown: jest.fn(),
  MistralOcrError: class extends Error {},
}));
jest.unstable_mockModule("@/backend/InventoryExtractionService", () => ({
  extractInventoryFromDocument: jest.fn(),
}));
jest.unstable_mockModule("@/backend/GHGINativeInputCatalogService", () => ({
  syncGHGIImportedInventorySource: jest.fn(),
  syncGHGIOcrArtifact: jest.fn(),
  syncPendingGHGIOcrArtifacts: jest.fn(),
  withdrawGHGIImportCatalog: jest.fn(),
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: { CONCEPT_NOTE_BUILDER: "cnb", CA_SERVICE_INTEGRATION: "ca" },
  hasServerFeatureFlag: moduleEnabled,
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let GET: typeof import("@/app/api/v1/concept-notes/[runId]/documents/route").GET;
let POST: typeof import("@/app/api/v1/concept-notes/[runId]/documents/route").POST;
let schemas: typeof import("@/backend/concept-note-document-pool");
beforeAll(async () => {
  ({ GET, POST } =
    await import("@/app/api/v1/concept-notes/[runId]/documents/route"));
  schemas = await import("@/backend/concept-note-document-pool");
});
const context = {
  session: { user: { id: userId } },
  params: { runId },
  searchParams: {},
};
function request(body?: Row): Request {
  return new Request(
    `http://localhost/api/v1/concept-notes/${runId}/documents`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
}
function addDocument(
  overrides: Row = {},
  content: string = "%PDF-1.7\nplan",
): void {
  documents.set(documentId, {
    id: documentId,
    contentHash: createHash("sha256").update(content).digest("hex"),
    originalFileName: "plan.pdf",
    cityId,
    visibility: "city",
    markdownReady: true,
    catalogId: "source-catalog",
    data: Buffer.from(content),
    s3Key: "private/original.pdf",
    uploadedByUserId: "different-owner",
    ...overrides,
  });
  catalogs.set(
    "source-catalog",
    saved({
      id: "source-catalog",
      availability: "active",
      kind: "ingest_document",
    }),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  documents.clear();
  catalogs.clear();
  jobs.clear();
  catalogCounter = 0;
  addDocument();
  canAccessCity.mockResolvedValue({ organizationId: "org-id" });
  moduleEnabled.mockReturnValue(true);
  putFile.mockResolvedValue(undefined);
  putTextFile.mockResolvedValue(undefined);
  readBytes.mockResolvedValue(Buffer.from("%PDF-1.7\nplan"));
  findDocuments.mockImplementation(async (query) =>
    visibleRows(query).slice(
      query.offset ?? 0,
      (query.offset ?? 0) + (query.limit ?? 100),
    ),
  );
  findDocument.mockImplementation(
    async (query) => visibleRows(query)[0] ?? null,
  );
  pdfFindOrCreate.mockImplementation(async (query) => {
    const key = query.where.sourceId as string;
    const existing = jobs.get(key);
    if (existing) return [existing, false];
    const row = saved(query.defaults ?? {});
    jobs.set(key, row);
    return [row, true];
  });
  createUpload.mockImplementation(async ({ method, body }) => {
    if (!method) return Response.json({ city_id: cityId });
    return Response.json({ upload_id: body?.upload_id, status: "queued" });
  });
});

describe("Concept Note shared city documents (real pool/catalog/OCR helpers)", () => {
  it("lists only safe metadata with bounded, deterministic pagination and active catalog filtering", async () => {
    documents.set("another", {
      ...documents.get(documentId),
      id: "another",
      data: Buffer.from("hidden"),
    });
    const response = await GET(request(), {
      ...context,
      searchParams: { limit: "1" },
    } as never);
    expect(await response.json()).toEqual({
      data: [
        {
          documentId,
          filename: "plan.pdf",
          sourceFormat: "pdf",
          markdownReady: true,
        },
      ],
      pagination: { limit: 1, offset: 0, hasMore: true },
    });
    const query = findDocuments.mock.calls[0][0];
    expect(query.attributes).toEqual([
      "id",
      "originalFileName",
      "markdownReady",
    ]);
    expect(query.where).toMatchObject({ cityId, visibility: "city" });
    expect(query.where.withdrawnAt).toEqual({ [Op.is]: null });
    expect(query.include?.[0].where).toMatchObject({ availability: "active" });
    expect(
      JSON.stringify(await (await GET(request(), context as never)).json()),
    ).not.toContain("private/");
  });

  it.each([
    ["other city", { cityId: "different-city" }, "active"],
    ["private run", { visibility: "run" }, "active"],
    ["project-only", { visibility: "project" }, "active"],
    ["other project", { projectId: "other-project" }, "active"],
    ["other organization", { organizationId: "other-org" }, "active"],
    ["withdrawn", { withdrawnAt: new Date() }, "withdrawn"],
    ["superseded", {}, "superseded"],
    ["purged", { bytesPurgedAt: new Date() }, "active"],
  ])(
    "hides and denies %s sources before CA registration",
    async (_label, overrides, availability) => {
      Object.assign(documents.get(documentId)!, overrides);
      catalogs.get("source-catalog")!.availability = availability;
      expect(
        (await (await GET(request(), context as never)).json()).data,
      ).toEqual([]);
      await expect(
        POST(request({ document_id: documentId }), context as never),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        createUpload.mock.calls.filter(([call]) => call.method === "POST"),
      ).toHaveLength(0);
      expect(putFile).not.toHaveBeenCalled();
    },
  );

  it("rejects inaccessible target runs before querying documents", async () => {
    createUpload.mockResolvedValue(
      Response.json({ detail: "Forbidden" }, { status: 403 }),
    );
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(findDocument).not.toHaveBeenCalled();
  });

  it("requires city access and active organization for mutation", async () => {
    canAccessCity.mockRejectedValue(
      Object.assign(new Error("Organization is frozen"), { status: 403 }),
    );
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(canAccessCity).toHaveBeenCalledWith(context.session, cityId, {
      includeResource: false,
      requireActive: true,
    });
    expect(findDocument).not.toHaveBeenCalled();
  });

  it("attaches PDF through real OCR queue helpers and replay retains one document/job/association", async () => {
    const first = await POST(
      request({ document_id: documentId, source_role: "climate_action_plan" }),
      context as never,
    );
    const result = await first.json();
    expect(first.status).toBe(202);
    expect(result).toMatchObject({
      documentId,
      status: "queued",
      stage: "ocr",
      filename: "plan.pdf",
      sourceRole: "climate_action_plan",
    });
    expect(result.uploadId).not.toBe(documentId);
    const second = await POST(
      request({ document_id: documentId, source_role: "climate_action_plan" }),
      context as never,
    );
    expect((await second.json()).uploadId).toBe(result.uploadId);
    expect(putFile).toHaveBeenCalledTimes(1);
    expect(jobs.size).toBe(1);
    expect(jobs.get(result.uploadId)).toMatchObject({
      sourceType: "concept_note_upload",
      annotationMode: "visual_context",
      deliveryTarget: "climate_advisor",
      status: "queued",
    });
    expect(documents.size).toBe(1);
    expect(createDocument).not.toHaveBeenCalled();
    expect(catalogs.size).toBe(2);
    expect(
      [...catalogs.values()].find((row) => row.sourceId === result.uploadId),
    ).toMatchObject({
      labels: { documentId, runId, visibility: "run" },
      userId,
    });
    expect(documents.get(documentId)).toMatchObject({
      visibility: "city",
      catalogId: "source-catalog",
    });
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it("registers Markdown through real normalization, durable artifact, and delivery helpers without PDF OCR", async () => {
    addDocument(
      { originalFileName: "plan.markdown" },
      "\uFEFF# City plan\r\nClimate action",
    );
    const response = await POST(
      request({ document_id: documentId }),
      context as never,
    );
    const result = await response.json();
    expect(result).toMatchObject({
      filename: "plan.md",
      status: "processing",
      stage: "delivery",
      sourceRole: "reference",
    });
    expect(putTextFile).toHaveBeenCalledWith(
      expect.stringContaining(result.uploadId),
      "# City plan\nClimate action",
    );
    expect(jobs.get(result.uploadId)).toMatchObject({
      model: "direct_markdown",
      status: "succeeded",
      deliveryStatus: "pending",
      resultSha256: createHash("sha256")
        .update("# City plan\nClimate action")
        .digest("hex"),
    });
    expect(putFile).not.toHaveBeenCalled();
  });

  it("uses original storage pointer only on the server when pool bytes are absent", async () => {
    documents.get(documentId)!.data = null;
    const result = await (
      await POST(request({ document_id: documentId }), context as never)
    ).json();
    expect(readBytes).toHaveBeenCalledWith({ s3Key: "private/original.pdf" });
    expect(JSON.stringify(result)).not.toContain("private/");
  });

  it("denies a withdrawn source on replay and never creates another target upload", async () => {
    await POST(request({ document_id: documentId }), context as never);
    catalogs.get("source-catalog")!.availability = "withdrawn";
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(jobs.size).toBe(1);
    expect(putFile).toHaveBeenCalledTimes(1);
  });

  it("rejects byte substitution and malformed Markdown before creating an upload", async () => {
    documents.get(documentId)!.data = Buffer.from("tampered");
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 409 });
    addDocument({ originalFileName: "plan.md" }, "\0bad");
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 422 });
    expect(putTextFile).not.toHaveBeenCalled();
  });

  it("preserves upload-limit errors", async () => {
    createUpload.mockImplementation(async ({ method }) =>
      !method
        ? Response.json({ city_id: cityId })
        : Response.json(
            { code: "concept_note_upload_limit_reached", detail: "limit" },
            { status: 409 },
          ),
    );
    expect(
      (await POST(request({ document_id: documentId }), context as never))
        .status,
    ).toBe(409);
    expect(putFile).not.toHaveBeenCalled();
  });

  it("never forwards upstream storage keys or exception metadata", async () => {
    createUpload.mockImplementation(async ({ method }) =>
      !method
        ? Response.json({ city_id: cityId })
        : Response.json(
            { detail: "private/storage/key.pdf", token: "secret" },
            { status: 503 },
          ),
    );
    const response = await POST(
      request({ document_id: documentId }),
      context as never,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      detail: "Climate Advisor rejected the document association",
      status: 503,
    });
  });

  it("marks failed storage handoffs and retries the same target upload successfully", async () => {
    putFile.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      POST(request({ document_id: documentId }), context as never),
    ).rejects.toMatchObject({ status: 503 });
    const registration = createUpload.mock.calls.find(
      ([call]) => call.body?.upload_id,
    )?.[0];
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/uploads/${registration?.body?.upload_id}/failed`,
        body: { error_code: "document_reuse_handoff_failed" },
      }),
    );
    createUpload.mockImplementation(async ({ method, path, body }) => {
      if (!method) return Response.json({ city_id: cityId });
      if (path.endsWith("/uploads"))
        return Response.json({ upload_id: body?.upload_id, status: "failed" });
      return Response.json({});
    });
    const result = await (
      await POST(request({ document_id: documentId }), context as never)
    ).json();
    expect(result.uploadId).toBe(registration?.body?.upload_id);
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/concept-notes/${runId}/uploads/${result.uploadId}/retry`,
      }),
    );
    expect(jobs.size).toBe(1);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("validates strict attach payload, pagination, auth, and module access", async () => {
    expect(
      schemas.conceptNoteDocumentQuery.safeParse({ limit: "101" }).success,
    ).toBe(false);
    expect(
      schemas.conceptNoteDocumentQuery.safeParse({ offset: "-1" }).success,
    ).toBe(false);
    expect(
      schemas.conceptNoteDocumentAttach.safeParse({
        document_id: documentId,
        city_id: cityId,
      }).success,
    ).toBe(false);
    await expect(
      GET(request(), { ...context, session: null } as never),
    ).rejects.toMatchObject({ status: 401 });
    moduleEnabled.mockReturnValue(false);
    await expect(GET(request(), context as never)).rejects.toMatchObject({
      status: 404,
    });
  });
});
