import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import { Op } from "sequelize";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type MockTransaction = { LOCK: { UPDATE: string } };

const findOrCreate = jest.fn<AsyncMock>();
const findOne = jest.fn<AsyncMock>();
const findAll = jest.fn<AsyncMock>();
const pdfOcrUpdate = jest.fn<AsyncMock>();
const transaction =
  jest.fn<
    (
      callback: (transaction: MockTransaction) => Promise<unknown>,
    ) => Promise<unknown>
  >();
const importedFindAll = jest.fn<AsyncMock>();
const importedFindByPk = jest.fn<AsyncMock>();
const importedUpdate = jest.fn<AsyncMock>();
const inventoryFindByPk = jest.fn<AsyncMock>();
const getTextFile = jest.fn<AsyncMock>();
const putTextFile = jest.fn<AsyncMock>();
const getFileMetadata = jest.fn<AsyncMock>();
const getFilePrefix = jest.fn<AsyncMock>();
const createSignedDownloadUrl = jest.fn<AsyncMock>();
const resolveImportedFileBuffer = jest.fn<AsyncMock>();
const extractRows = jest.fn<AsyncMock>();
const extractStructured = jest.fn<AsyncMock>();
const extraction = {
  rows: [{ sector: "Energy", totalCO2e: 12 }],
  summary: {
    reportedTotals: [],
    droppedRows: {},
    importedSum: 12,
    yearAssumed: false,
    targetYear: 2024,
  },
};
const convertPdfUrlToMarkdown = jest.fn<AsyncMock>();
const pdfFindByPk = jest.fn<AsyncMock>();
const syncGHGIImportedInventorySource = jest.fn<AsyncMock>();
const syncGHGIOcrArtifact = jest.fn<AsyncMock>();
const syncPendingGHGIOcrArtifacts = jest.fn<AsyncMock>();
const withdrawGHGIImportCatalog = jest.fn<AsyncMock>();

class MistralOcrError extends Error {
  code: string;
  retryable: boolean;

  constructor(code = "mistral_unavailable", retryable = true, message = code) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

jest.unstable_mockModule("@/models", () => ({
  db: {
    sequelize: { transaction },
    models: {
      PdfOcrJob: {
        findOrCreate,
        findOne,
        findAll,
        findByPk: pdfFindByPk,
        update: pdfOcrUpdate,
      },
      ImportedInventoryFile: {
        findAll: importedFindAll,
        findByPk: importedFindByPk,
        update: importedUpdate,
      },
      Inventory: { findByPk: inventoryFindByPk },
    },
  },
}));
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  default: {
    getTextFile,
    putTextFile,
    getFileMetadata,
    getFilePrefix,
    createSignedDownloadUrl,
    resolveImportedFileBuffer,
  },
}));
jest.unstable_mockModule("@/backend/MistralOcrService", () => ({
  MistralOcrError,
  convertPdfUrlToMarkdown,
}));
jest.unstable_mockModule("@/backend/InventoryExtractionService", () => ({
  extractInventoryFromDocument: extractRows,
  extractInventoryFromStructured: extractStructured,
  TARGET_YEAR_NOT_FOUND: "Inventory not found for the target year",
}));
jest.unstable_mockModule("@/backend/GHGINativeInputCatalogService", () => ({
  syncGHGIImportedInventorySource,
  syncGHGIOcrArtifact,
  syncPendingGHGIOcrArtifacts,
  withdrawGHGIImportCatalog,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let enqueueInventoryPdfOcr: typeof import("@/backend/PdfOcrService").enqueueInventoryPdfOcr;
let enqueueConceptNotePdfOcr: typeof import("@/backend/PdfOcrService").enqueueConceptNotePdfOcr;
let conceptNotePdfSourceKey: typeof import("@/backend/PdfOcrService").conceptNotePdfSourceKey;
let normalizeConceptNoteMarkdown: typeof import("@/backend/PdfOcrService").normalizeConceptNoteMarkdown;
let registerConceptNoteMarkdownUpload: typeof import("@/backend/PdfOcrService").registerConceptNoteMarkdownUpload;
let retryConceptNotePdfOcr: typeof import("@/backend/PdfOcrService").retryConceptNotePdfOcr;
let normalizeConceptNotePdfOcrStatus: typeof import("@/backend/PdfOcrService").normalizeConceptNotePdfOcrStatus;
let claimPdfOcrJobs: typeof import("@/backend/PdfOcrService").claimPdfOcrJobs;
let claimInventoryExtractionJobs: typeof import("@/backend/PdfOcrService").claimInventoryExtractionJobs;
let getInventoryPdfOcrStatus: typeof import("@/backend/PdfOcrService").getInventoryPdfOcrStatus;
let extractInventoryRowsFromStoredMarkdown: typeof import("@/backend/PdfOcrService").extractInventoryRowsFromStoredMarkdown;
let processPdfOcrJobs: typeof import("@/backend/PdfOcrService").processPdfOcrJobs;
let isLegacyMarkdownOnlyPdfJob: typeof import("@/backend/PdfOcrService").isLegacyMarkdownOnlyPdfJob;

beforeAll(async () => {
  ({
    enqueueInventoryPdfOcr,
    enqueueConceptNotePdfOcr,
    conceptNotePdfSourceKey,
    normalizeConceptNoteMarkdown,
    registerConceptNoteMarkdownUpload,
    retryConceptNotePdfOcr,
    normalizeConceptNotePdfOcrStatus,
    claimPdfOcrJobs,
    claimInventoryExtractionJobs,
    getInventoryPdfOcrStatus,
    extractInventoryRowsFromStoredMarkdown,
    processPdfOcrJobs,
    isLegacyMarkdownOnlyPdfJob,
  } = await import("@/backend/PdfOcrService"));
});

describe("PdfOcrJob queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback) =>
      callback({ LOCK: { UPDATE: "UPDATE" } }),
    );
    pdfOcrUpdate.mockResolvedValue([1]);
    importedUpdate.mockResolvedValue([1]);
    resolveImportedFileBuffer.mockResolvedValue(null);
    findOne.mockResolvedValue(null);
  });

  it.each(["pending", "delivering", "failed"] as const)(
    "recognizes a valid pre-feature PDF during %s delivery recovery",
    (deliveryStatus) => {
      expect(
        isLegacyMarkdownOnlyPdfJob({
          sourceType: "concept_note_upload",
          status: "succeeded",
          model: "mistral-ocr-latest",
          annotationMode: "none",
          resultS3Key: "original.md",
          resultSha256: "a".repeat(64),
          pageCount: 2,
          structuredS3Key: null,
          structuredSha256: null,
          structuredSizeBytes: null,
          structuredSchemaVersion: null,
          deliveryStatus,
        } as never),
      ).toBe(true);
    },
  );

  it.each([
    { status: "failed" },
    { sourceType: "inventory_import" },
    { model: "direct_markdown" },
    { annotationMode: "visual_context" },
    { structuredSha256: "partial" },
    { resultSha256: "invalid" },
    { pageCount: 0 },
  ])("does not classify ineligible PDF state as legacy: %o", (patch) => {
    expect(
      isLegacyMarkdownOnlyPdfJob({
        sourceType: "concept_note_upload",
        status: "succeeded",
        model: "mistral-ocr-latest",
        annotationMode: "none",
        resultS3Key: "original.md",
        resultSha256: "a".repeat(64),
        pageCount: 2,
        structuredS3Key: null,
        structuredSha256: null,
        structuredSizeBytes: null,
        structuredSchemaVersion: null,
        ...patch,
      } as never),
    ).toBe(false);
  });

  it("uses the composite source identity and idempotent find-or-create", async () => {
    const job = { status: "queued" };
    findOrCreate.mockResolvedValue([job, false]);
    const importedFile = {
      id: "11111111-1111-4111-8111-111111111111",
      update: jest
        .fn<(values: Record<string, unknown>) => Promise<void>>()
        .mockResolvedValue(undefined),
    } as unknown as Parameters<typeof enqueueInventoryPdfOcr>[0];
    await expect(enqueueInventoryPdfOcr(importedFile)).resolves.toBe(job);
    expect(findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceType: "inventory_import", sourceId: importedFile.id },
        defaults: expect.objectContaining({ annotationMode: "none" }),
      }),
    );
    expect(importedFile.update).toHaveBeenCalledWith(
      expect.objectContaining({ importStatus: "extracting" }),
    );
  });

  it("uses the upload identity for one CA-delivered CNB OCR job", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const job = { status: "queued", annotationMode: "visual_context" };
    findOrCreate.mockResolvedValue([job, false]);

    await expect(enqueueConceptNotePdfOcr(uploadId)).resolves.toBe(job);

    expect(findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType: "concept_note_upload",
          sourceId: uploadId,
        },
        defaults: expect.objectContaining({
          deliveryTarget: "climate_advisor",
          deliveryStatus: "pending",
          annotationMode: "visual_context",
        }),
      }),
    );
    expect(conceptNotePdfSourceKey(uploadId)).toBe(
      `pdf-ocr/sources/concept_note_upload/${uploadId}/source.pdf`,
    );
  });

  it("normalizes direct Markdown without adding synthetic page markers", async () => {
    expect(normalizeConceptNoteMarkdown("\uFEFF# Plan\r\n## Need")).toBe(
      "# Plan\n## Need",
    );
    expect(() => normalizeConceptNoteMarkdown("\0# Plan")).toThrow("NUL");
    expect(() => normalizeConceptNoteMarkdown(" \n\t ")).toThrow(
      "non-whitespace",
    );
  });

  it("persists a direct Markdown upload as a succeeded delivery artifact", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const resultSha256 = createHash("sha256").update("# Plan").digest("hex");
    const job = { status: "succeeded" };
    findOrCreate.mockResolvedValue([job, true]);
    putTextFile.mockResolvedValue(undefined);

    await expect(
      registerConceptNoteMarkdownUpload(uploadId, "# Plan"),
    ).resolves.toBe(job as never);

    expect(putTextFile).toHaveBeenCalledWith(
      `pdf-ocr/results/concept_note_upload/${uploadId}/direct-${resultSha256}/combined_markdown.md`,
      "# Plan",
    );
    expect(findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType: "concept_note_upload",
          sourceId: uploadId,
        },
        defaults: expect.objectContaining({
          status: "succeeded",
          attemptCount: 0,
          model: "direct_markdown",
          pageCount: null,
          deliveryStatus: "pending",
          deliveryRunAfter: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects changed Markdown identity before replacing an existing artifact", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    findOne.mockResolvedValue({
      model: "direct_markdown",
      pageCount: null,
      resultS3Key: `pdf-ocr/results/concept_note_upload/${uploadId}/direct-old/combined_markdown.md`,
      resultSha256: "a".repeat(64),
    });

    await expect(
      registerConceptNoteMarkdownUpload(uploadId, "# Changed"),
    ).rejects.toThrow("identity cannot change");

    expect(putTextFile).not.toHaveBeenCalled();
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("retries pointer delivery without resetting successful OCR", async () => {
    const update = jest
      .fn<(values: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined);
    const job = {
      status: "succeeded",
      attemptCount: 2,
      deliveryStatus: "failed",
      sourceType: "concept_note_upload",
      model: "mistral-ocr-latest",
      annotationMode: "none",
      resultS3Key: "original.md",
      resultSha256: "a".repeat(64),
      pageCount: 2,
      structuredS3Key: null,
      structuredSha256: null,
      structuredSizeBytes: null,
      structuredSchemaVersion: null,
      update,
    } as unknown as Parameters<typeof retryConceptNotePdfOcr>[0];

    await expect(retryConceptNotePdfOcr(job)).resolves.toBe("delivery");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryStatus: "pending",
        deliveryErrorCode: null,
      }),
    );
    expect(update.mock.calls[0][0]).not.toHaveProperty("status");
    expect(update.mock.calls[0][0]).not.toHaveProperty("attemptCount");
    expect(update.mock.calls[0][0]).not.toHaveProperty("resultS3Key");
    expect(update.mock.calls[0][0]).not.toHaveProperty("resultSha256");
    expect(update.mock.calls[0][0]).not.toHaveProperty("structuredS3Key");
  });

  it("distinguishes retryable OCR failure from retryable delivery failure", () => {
    expect(
      normalizeConceptNotePdfOcrStatus({
        status: "failed",
        deliveryStatus: "delivered",
        errorCode: "mistral_unavailable",
      } as never),
    ).toEqual({
      status: "failed",
      stage: "ocr",
      canRetry: true,
      retryKind: "ocr",
      errorCode: "mistral_unavailable",
    });

    expect(
      normalizeConceptNotePdfOcrStatus({
        status: "succeeded",
        deliveryStatus: "failed",
        deliveryErrorCode: "ca_delivery_rejected",
      } as never),
    ).toEqual({
      status: "failed",
      stage: "delivery",
      canRetry: true,
      retryKind: "delivery",
      errorCode: "ca_delivery_rejected",
    });
  });

  it("claims at most two due jobs atomically with SKIP LOCKED and leases", async () => {
    const jobs = [0, 1].map(() => ({
      attemptCount: 0,
      startedAt: null,
      update: jest
        .fn<
          (values: Record<string, unknown>, options?: unknown) => Promise<void>
        >()
        .mockResolvedValue(undefined),
    }));
    findAll.mockResolvedValue(jobs);
    await expect(claimPdfOcrJobs("worker-1")).resolves.toEqual(jobs);
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, skipLocked: true, lock: "UPDATE" }),
    );
    for (const job of jobs) {
      expect(job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "running",
          attemptCount: 1,
          leaseOwner: "worker-1",
        }),
        expect.anything(),
      );
    }
  });

  it("prioritizes expired leases ahead of dated queued work", async () => {
    findAll.mockResolvedValue([]);

    await claimPdfOcrJobs("worker-1");

    const options = findAll.mock.calls[0][0] as {
      order: unknown;
      where: Record<symbol, unknown>;
    };
    expect(options.order).toEqual([
      ["runAfter", "ASC NULLS FIRST"],
      ["leaseExpiresAt", "ASC NULLS LAST"],
      ["created", "ASC"],
    ]);
    const candidates = options.where[Op.or] as Array<{
      status: string;
      leaseExpiresAt?: Record<symbol, unknown>;
    }>;
    const expiredRunning = candidates.find(
      (candidate) => candidate.status === "running",
    );
    expect(expiredRunning?.leaseExpiresAt?.[Op.lte]).toBeInstanceOf(Date);
  });

  it("filters extraction eligibility before applying the batch limit", async () => {
    const jobs = [
      {
        update: jest
          .fn<
            (
              values: Record<string, unknown>,
              options?: unknown,
            ) => Promise<void>
          >()
          .mockResolvedValue(undefined),
      },
    ];
    findAll.mockResolvedValue(jobs);

    await expect(claimInventoryExtractionJobs("extractor-1")).resolves.toEqual(
      jobs,
    );

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "inventory_import",
          status: "succeeded",
        }),
        limit: 2,
        skipLocked: true,
        lock: "UPDATE",
      }),
    );
    expect(importedFindAll).not.toHaveBeenCalled();
    const options = findAll.mock.calls[0][0] as {
      order: unknown;
      where: {
        sourceId: Record<symbol, { val: string }>;
      };
    };
    expect(options.where.sourceId[Op.in].val).toContain(
      "\"import_status\" = 'extracting'",
    );
    expect(options.order).toEqual([
      ["completedAt", "ASC"],
      ["sourceId", "ASC"],
    ]);
    expect(jobs[0].update).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseOwner: "extractor-1",
        leaseExpiresAt: expect.any(Date),
        heartbeatAt: expect.any(Date),
      }),
      expect.anything(),
    );
    expect(jobs[0].update.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("returns only sanitized public status fields", async () => {
    findOne.mockResolvedValue({
      status: "failed",
      attemptCount: 3,
      errorCode: "invalid_pdf_source",
      resultS3Key: "secret/key",
      resultSha256: "secret",
      leaseOwner: "secret",
    });
    await expect(getInventoryPdfOcrStatus("source")).resolves.toEqual({
      status: "failed",
      errorCode: "invalid_pdf_source",
      canRetry: false,
    });
  });

  it("reuses stored Markdown after downstream failure without calling Mistral again", async () => {
    const importedFile = {
      inventoryId: "inventory-id",
      importStatus: "extracting",
      mappingConfiguration: {},
      update: jest.fn<(values: Record<string, unknown>) => Promise<void>>(),
    };
    importedFile.update.mockImplementation(async (values) => {
      Object.assign(importedFile, values);
    });
    const job = {
      sourceType: "inventory_import",
      sourceId: "source-id",
      status: "succeeded",
      resultS3Key: "result.md",
    } as unknown as Parameters<
      typeof extractInventoryRowsFromStoredMarkdown
    >[0];
    importedFindByPk.mockResolvedValue(importedFile);
    inventoryFindByPk.mockResolvedValue({ year: 2024 });
    getTextFile.mockResolvedValue(
      "<!-- page: 1 -->\n| Sector | tCO2e |\n|---|---:|\n| Energy | 12 |",
    );
    extractRows
      .mockRejectedValueOnce(new Error("row extraction failed"))
      .mockResolvedValueOnce(extraction);
    importedUpdate.mockImplementation(async (values) => {
      Object.assign(importedFile, values);
      return [1];
    });

    await extractInventoryRowsFromStoredMarkdown(job, "extractor-1");
    expect(importedFile.importStatus).toBe("failed");
    expect(job.status).toBe("succeeded");

    importedFile.importStatus = "extracting";
    await extractInventoryRowsFromStoredMarkdown(job, "extractor-2");
    expect(importedFile.importStatus).toBe("waiting_for_approval");
    expect(importedFile.mappingConfiguration).toEqual(
      expect.objectContaining({
        rows: extraction.rows,
        extractionSummary: extraction.summary,
      }),
    );
    expect(getTextFile).toHaveBeenCalledTimes(2);
    expect(convertPdfUrlToMarkdown).not.toHaveBeenCalled();
  });

  const runStoredExtraction = async () => {
    const importedFile = {
      inventoryId: "inventory-id",
      importStatus: "extracting",
      mappingConfiguration: { keep: true, rows: [{ sector: "Old" }] } as Record<
        string,
        unknown
      >,
      update: jest.fn<(values: Record<string, unknown>) => Promise<void>>(),
    };
    const job = {
      sourceType: "inventory_import",
      sourceId: "source-id",
      status: "succeeded",
      resultS3Key: "result.md",
    } as unknown as Parameters<
      typeof extractInventoryRowsFromStoredMarkdown
    >[0];
    importedFindByPk.mockResolvedValue(importedFile);
    inventoryFindByPk.mockResolvedValue({ year: 2022 });
    getTextFile.mockResolvedValue("OCR Markdown");
    importedUpdate.mockImplementation(async (values) => {
      Object.assign(importedFile, values);
      return [1];
    });
    await extractInventoryRowsFromStoredMarkdown(job, "extractor-1");
    return importedFile as typeof importedFile & { errorLog?: string };
  };

  it("fails a totals-only extraction with an i18n reason and keeps the summary (CC-1202)", async () => {
    const summary = {
      ...extraction.summary,
      importedSum: 0,
      targetYear: 2022,
      droppedRows: { subtotal_or_total: 1 },
      reportedTotals: [
        {
          label: "Total CO2 emissions",
          value: 1_788_000,
          year: 2022,
          scope: null,
          sector: null,
          subsector: null,
          level: "total",
        },
      ],
    };
    extractRows.mockResolvedValueOnce({ rows: [], summary });

    const importedFile = await runStoredExtraction();

    expect(importedFile.importStatus).toBe("failed");
    expect(importedFile.errorLog).toBe("i18n:pdf-extraction-only-totals");
    expect(importedFile.mappingConfiguration).toEqual(
      expect.objectContaining({ keep: true, extractionSummary: summary }),
    );
    expect(importedFile.mappingConfiguration.rows).toBeUndefined();
  });

  it("fails an empty extraction with the no-data reason (CC-1202)", async () => {
    extractRows.mockResolvedValueOnce({
      rows: [],
      summary: { ...extraction.summary, importedSum: 0 },
    });

    const importedFile = await runStoredExtraction();

    expect(importedFile.importStatus).toBe("failed");
    expect(importedFile.errorLog).toBe("i18n:pdf-extraction-no-data");
  });

  it("translates the target-year error into an i18n reason (CC-1202)", async () => {
    extractRows.mockRejectedValueOnce(
      new Error("Inventory not found for the target year"),
    );

    const importedFile = await runStoredExtraction();

    expect(importedFile.importStatus).toBe("failed");
    expect(importedFile.errorLog).toBe(
      "i18n:inventory-not-found-for-target-year",
    );
  });

  describe("structured or Markdown extraction path (CC-1163 stage 2)", () => {
    // The structured path is behind GHGI_STRUCTURED_EXTRACTION (default off).
    beforeEach(() => {
      process.env.GHGI_STRUCTURED_EXTRACTION = "1";
    });
    afterEach(() => {
      delete process.env.GHGI_STRUCTURED_EXTRACTION;
    });

    const markdown =
      "<!-- page: 1 -->\n| Sector | tCO2e |\n|---|---:|\n| Energy | 12 |";
    const structured = {
      schema_version: "citycatalyst.structured-document.1",
      annotation_mode: "none",
      provider: {
        name: "mistral",
        requested_model: "mistral-ocr-latest",
        returned_model: "mistral-ocr-latest",
        payload: {},
      },
      document: {
        page_count: 1,
        pages: [
          {
            page_index: 0,
            dimensions: { width: 1, height: 1, dpi: null },
            header: null,
            footer: null,
            markdown: "[tbl-0.md](tbl-0.md)",
            blocks: [],
            tables: [
              {
                table_id: "tbl-0.md",
                page_index: 0,
                content: "| Sector | tCO2e |\n|---|---:|\n| Energy | 12 |",
                bbox_px: null,
                bbox_norm: null,
              },
            ],
            images: [],
          },
        ],
        relationships: [],
      },
    };

    const runWithArtifact = async (
      jobPatch: Record<string, unknown>,
      structuredText: string = JSON.stringify(structured),
    ) => {
      const importedFile = {
        inventoryId: "inventory-id",
        importStatus: "extracting",
        mappingConfiguration: {} as Record<string, unknown>,
        update: jest.fn<(values: Record<string, unknown>) => Promise<void>>(),
      };
      const job = {
        sourceType: "inventory_import",
        sourceId: "source-id",
        status: "succeeded",
        resultS3Key: "result.md",
        structuredS3Key: "document.structured.json",
        structuredSchemaVersion: "citycatalyst.structured-document.1",
        ...jobPatch,
      } as unknown as Parameters<
        typeof extractInventoryRowsFromStoredMarkdown
      >[0];
      importedFindByPk.mockResolvedValue(importedFile);
      inventoryFindByPk.mockResolvedValue({ year: 2024 });
      getTextFile.mockImplementation(async (key) =>
        key === "result.md" ? markdown : structuredText,
      );
      extractRows.mockResolvedValue(extraction);
      extractStructured.mockResolvedValue(extraction);
      importedUpdate.mockImplementation(async (values) => {
        Object.assign(importedFile, values);
        return [1];
      });
      await extractInventoryRowsFromStoredMarkdown(job, "extractor-1");
      return importedFile;
    };

    /** The path was logged exactly once, with this reason. */
    const expectPath = async (
      extractionPath: "structured" | "markdown",
      reason: string | null,
    ) => {
      const { logger } = await import("@/services/logger");
      const calls = (logger.info as jest.Mock).mock.calls.filter(
        (call) => call[1] === "Inventory extraction path",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toEqual(
        expect.objectContaining({ extractionPath, reason }),
      );
    };

    it.each([undefined, "", "0", "false", "yes"])(
      "with GHGI_STRUCTURED_EXTRACTION=%p the Markdown path runs (structured_disabled)",
      async (flag) => {
        if (flag === undefined) delete process.env.GHGI_STRUCTURED_EXTRACTION;
        else process.env.GHGI_STRUCTURED_EXTRACTION = flag;
        const importedFile = await runWithArtifact({});
        expect(extractStructured).not.toHaveBeenCalled();
        expect(getTextFile).not.toHaveBeenCalledWith("document.structured.json");
        expect(extractRows).toHaveBeenCalledWith(
          markdown,
          expect.objectContaining({ targetYear: 2024 }),
        );
        expect(importedFile.importStatus).toBe("waiting_for_approval");
        await expectPath("markdown", "structured_disabled");
      },
    );

    it.each(["1", "true", "TRUE", " true "])(
      "with GHGI_STRUCTURED_EXTRACTION=%p the structured path runs",
      async (flag) => {
        process.env.GHGI_STRUCTURED_EXTRACTION = flag;
        await runWithArtifact({});
        expect(extractStructured).toHaveBeenCalled();
        expect(extractRows).not.toHaveBeenCalled();
        await expectPath("structured", null);
      },
    );

    describe("an unreconciled structured run (R22)", () => {
      const withSelection = (
        pageSelection: "reconciled" | "fallback",
        importedSum: number,
      ) => ({
        rows: [{ sector: "Energy", totalCO2e: importedSum }],
        summary: { ...extraction.summary, importedSum, pageSelection },
      });

      it("uses the Markdown result when it reconciles", async () => {
        extractStructured.mockResolvedValueOnce(withSelection("fallback", 99));
        extractRows.mockResolvedValueOnce(withSelection("reconciled", 12));
        const importedFile = await runWithArtifact({});
        expect(extractStructured).toHaveBeenCalledTimes(1);
        expect(extractRows).toHaveBeenCalledWith(markdown, expect.anything());
        expect(importedFile.mappingConfiguration).toEqual(
          expect.objectContaining({
            rows: [{ sector: "Energy", totalCO2e: 12 }],
          }),
        );
        await expectPath("markdown", "structured_unreconciled");
      });

      it("keeps the structured result when the Markdown run does not reconcile", async () => {
        extractStructured.mockResolvedValueOnce(withSelection("fallback", 99));
        extractRows.mockResolvedValueOnce(withSelection("fallback", 12));
        const importedFile = await runWithArtifact({});
        expect(extractRows).toHaveBeenCalledTimes(1);
        expect(importedFile.mappingConfiguration).toEqual(
          expect.objectContaining({
            rows: [{ sector: "Energy", totalCO2e: 99 }],
          }),
        );
        await expectPath("structured", "structured_unreconciled");
      });

      it("keeps the structured result when the Markdown run fails", async () => {
        extractStructured.mockResolvedValueOnce(withSelection("fallback", 99));
        extractRows.mockRejectedValueOnce(new Error("provider down"));
        const importedFile = await runWithArtifact({});
        expect(importedFile.importStatus).toBe("waiting_for_approval");
        expect(importedFile.mappingConfiguration).toEqual(
          expect.objectContaining({
            rows: [{ sector: "Energy", totalCO2e: 99 }],
          }),
        );
        await expectPath("structured", "structured_unreconciled");
      });

      it("does not run the Markdown path for a reconciled structured run", async () => {
        extractStructured.mockResolvedValueOnce(withSelection("reconciled", 99));
        await runWithArtifact({});
        expect(extractRows).not.toHaveBeenCalled();
        await expectPath("structured", null);
      });
    });

    it("uses the structured path when the job has a supported artifact", async () => {
      const importedFile = await runWithArtifact({});
      expect(extractStructured).toHaveBeenCalledWith(
        structured,
        markdown,
        expect.objectContaining({ targetYear: 2024 }),
      );
      expect(extractRows).not.toHaveBeenCalled();
      expect(importedFile.importStatus).toBe("waiting_for_approval");
    });

    it("a job with no structuredS3Key uses the Markdown path", async () => {
      const importedFile = await runWithArtifact({
        structuredS3Key: null,
        structuredSchemaVersion: null,
      });
      expect(extractRows).toHaveBeenCalledWith(
        markdown,
        expect.objectContaining({ targetYear: 2024 }),
      );
      expect(extractStructured).not.toHaveBeenCalled();
      expect(getTextFile).toHaveBeenCalledTimes(1);
      expect(importedFile.importStatus).toBe("waiting_for_approval");
    });

    it("a job whose artifact has the wrong schema version uses the Markdown path", async () => {
      await runWithArtifact({
        structuredSchemaVersion: "citycatalyst.structured-document.0",
      });
      expect(extractRows).toHaveBeenCalled();
      expect(extractStructured).not.toHaveBeenCalled();
      expect(getTextFile).not.toHaveBeenCalledWith("document.structured.json");
    });

    it("an artifact whose own schema version is wrong uses the Markdown path", async () => {
      await runWithArtifact(
        {},
        JSON.stringify({ ...structured, schema_version: "other.1" }),
      );
      expect(extractRows).toHaveBeenCalled();
      expect(extractStructured).not.toHaveBeenCalled();
    });

    it("a job whose artifact JSON is truncated uses the Markdown path and the import finishes", async () => {
      const truncated = JSON.stringify(structured).slice(0, 120);
      const importedFile = await runWithArtifact({}, truncated);
      expect(extractStructured).not.toHaveBeenCalled();
      expect(extractRows).toHaveBeenCalledWith(markdown, expect.anything());
      expect(importedFile.importStatus).toBe("waiting_for_approval");
      expect(importedFile.mappingConfiguration).toEqual(
        expect.objectContaining({ rows: extraction.rows }),
      );
    });

    it("a structured run with no line item falls back to the Markdown path (structured_empty)", async () => {
      const { readFileSync } = await import("node:fs");
      const { logger } = await import("@/services/logger");
      const chartOnly = readFileSync(
        "tests/fixtures/structured/chart-caption-only.json",
        "utf8",
      );
      // Takes precedence over the default answer runWithArtifact sets.
      extractStructured.mockResolvedValueOnce({
        rows: [],
        summary: { ...extraction.summary, importedSum: 0 },
      });
      const importedFile = await runWithArtifact({}, chartOnly);
      expect(extractStructured).toHaveBeenCalledWith(
        JSON.parse(chartOnly),
        markdown,
        expect.anything(),
      );
      expect(extractRows).toHaveBeenCalledTimes(1);
      expect(extractRows).toHaveBeenCalledWith(markdown, expect.anything());
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          extractionPath: "markdown",
          reason: "structured_empty",
        }),
        "Inventory extraction path",
      );
      expect(importedFile.importStatus).toBe("waiting_for_approval");
      expect(importedFile.mappingConfiguration).toEqual(
        expect.objectContaining({ rows: extraction.rows }),
      );
    });

    it("an artifact that cannot be read uses the Markdown path", async () => {
      const importedFile = {
        inventoryId: "inventory-id",
        importStatus: "extracting",
        mappingConfiguration: {} as Record<string, unknown>,
        update: jest.fn<(values: Record<string, unknown>) => Promise<void>>(),
      };
      importedFindByPk.mockResolvedValue(importedFile);
      inventoryFindByPk.mockResolvedValue({ year: 2024 });
      getTextFile.mockImplementation(async (key) => {
        if (key === "result.md") return markdown;
        throw new Error("NoSuchKey");
      });
      extractRows.mockResolvedValue(extraction);
      importedUpdate.mockImplementation(async (values) => {
        Object.assign(importedFile, values);
        return [1];
      });
      await extractInventoryRowsFromStoredMarkdown(
        {
          sourceType: "inventory_import",
          sourceId: "source-id",
          status: "succeeded",
          resultS3Key: "result.md",
          structuredS3Key: "document.structured.json",
          structuredSchemaVersion: "citycatalyst.structured-document.1",
        } as never,
        "extractor-1",
      );
      expect(extractStructured).not.toHaveBeenCalled();
      expect(importedFile.importStatus).toBe("waiting_for_approval");
      await expectPath("markdown", "artifact_unreadable");
    });

    it.each([
      [
        "no_structured_artifact",
        { structuredS3Key: null, structuredSchemaVersion: null },
        undefined,
      ],
      [
        "unsupported_schema_version",
        { structuredSchemaVersion: "citycatalyst.structured-document.0" },
        undefined,
      ],
      ["artifact_invalid", {}, JSON.stringify(structured).slice(0, 120)],
    ] as const)(
      "logs the Markdown path once with reason %s",
      async (reason, patch, text) => {
        await runWithArtifact(patch, text);
        await expectPath("markdown", reason);
      },
    );

    it("logs the structured path once when the structured run succeeds", async () => {
      await runWithArtifact({});
      await expectPath("structured", null);
    });

    it("a plain Error with the target-year message is not a fallback", async () => {
      extractStructured.mockRejectedValueOnce(
        new Error("Inventory not found for the target year"),
      );
      const importedFile = await runWithArtifact({});
      expect(extractRows).not.toHaveBeenCalled();
      expect(importedFile.importStatus).toBe("failed");
    });

    it("logs the path once when the structured run throws", async () => {
      extractStructured.mockRejectedValueOnce(new Error("provider down"));
      const importedFile = await runWithArtifact({});
      expect(extractRows).not.toHaveBeenCalled();
      expect(importedFile.importStatus).toBe("failed");
      await expectPath("structured", null);
    });

    it("a structured run emptied by the year filter falls back to the Markdown path", async () => {
      const { LLMError, LLMErrorCode } = await import("@/backend/llm/types");
      extractStructured.mockRejectedValueOnce(
        new LLMError(
          "Inventory not found for the target year",
          LLMErrorCode.BAD_REQUEST,
        ),
      );
      const importedFile = await runWithArtifact({});
      expect(extractRows).toHaveBeenCalledWith(markdown, expect.anything());
      expect(importedFile.importStatus).toBe("waiting_for_approval");
      expect(importedFile.mappingConfiguration).toEqual(
        expect.objectContaining({ rows: extraction.rows }),
      );
      await expectPath("markdown", "structured_empty");
    });

    it("the progress bar never moves back when the Markdown path follows", async () => {
      type Progress = (current: number, total: number) => Promise<void>;
      extractStructured.mockImplementationOnce(async (...args) => {
        const options = args[2] as { onChunkProgress: Progress };
        await options.onChunkProgress(1, 2);
        await options.onChunkProgress(2, 2);
        return { rows: [], summary: extraction.summary };
      });
      extractRows.mockImplementationOnce(async (...args) => {
        const options = args[1] as { onChunkProgress: Progress };
        await options.onChunkProgress(1, 4);
        await options.onChunkProgress(4, 4);
        return extraction;
      });
      const importedFile = await runWithArtifact({});
      const shown = importedFile.update.mock.calls.map((call) => {
        const config = call[0].mappingConfiguration as {
          extractionProgress: { current: number; total: number };
        };
        return config.extractionProgress;
      });
      expect(shown).toEqual([
        { current: 1, total: 2 },
        { current: 2, total: 2 },
        { current: 4, total: 4 },
        { current: 4, total: 4 },
      ]);
      expect(importedFile.importStatus).toBe("waiting_for_approval");
    });
  });

  it("prevents a stale extractor from overwriting a newer terminal state", async () => {
    const importedFile = {
      inventoryId: "inventory-id",
      importStatus: "extracting",
      mappingConfiguration: {},
      update: jest.fn<(values: Record<string, unknown>) => Promise<void>>(),
    };
    const job = {
      sourceType: "inventory_import",
      sourceId: "source-id",
      status: "succeeded",
      resultS3Key: "result.md",
    } as unknown as Parameters<
      typeof extractInventoryRowsFromStoredMarkdown
    >[0];
    importedFindByPk.mockResolvedValue(importedFile);
    inventoryFindByPk.mockResolvedValue({ year: 2024 });
    getTextFile.mockResolvedValue("OCR Markdown");
    extractRows.mockResolvedValue(extraction);
    pdfOcrUpdate.mockResolvedValue([0]);

    await extractInventoryRowsFromStoredMarkdown(job, "stale-extractor");

    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({ leaseOwner: "stale-extractor" }),
      }),
    );
    expect(importedUpdate).not.toHaveBeenCalled();
  });

  it("rejects an idempotent CNB re-enqueue that would change annotation mode", async () => {
    findOrCreate.mockResolvedValue([
      { status: "queued", annotationMode: "none" },
      false,
    ]);

    await expect(
      enqueueConceptNotePdfOcr("22222222-2222-4222-8222-222222222222"),
    ).rejects.toThrow("annotation mode cannot change");
  });

  it("clears stale structured metadata when a failed PDF is explicitly retried", async () => {
    const update = jest
      .fn<(values: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined);
    const job = {
      status: "failed",
      model: "mistral-ocr-latest",
      structuredS3Key: "old/document.structured.json",
      update,
    } as unknown as Parameters<typeof retryConceptNotePdfOcr>[0];

    await expect(retryConceptNotePdfOcr(job)).resolves.toBe("ocr");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        annotationMode: "visual_context",
        resultS3Key: null,
        structuredS3Key: null,
        structuredSha256: null,
        structuredSchemaVersion: null,
      }),
    );
  });

  it("writes both artifacts before a leased PDF job can succeed", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: uploadId,
      annotationMode: "visual_context",
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    const markdown =
      "<!-- page: 1 -->\n# Plan\n\n| Fuel | tCO2e |\n|---|---:|\n| Gas | 12.50 |";
    convertPdfUrlToMarkdown.mockResolvedValue({
      ...ocrResult(),
      markdown,
    });

    await processPdfOcrJobs();

    const markdownKey = `pdf-ocr/results/concept_note_upload/${uploadId}/1/combined_markdown.md`;
    const structuredKey = `pdf-ocr/results/concept_note_upload/${uploadId}/1/document.structured.json`;
    expect(convertPdfUrlToMarkdown).toHaveBeenCalledWith(
      "https://signed.example/source.pdf",
      "visual_context",
    );
    expect(putTextFile).toHaveBeenNthCalledWith(1, markdownKey, markdown);
    expect(putTextFile).toHaveBeenNthCalledWith(
      2,
      structuredKey,
      expect.stringContaining("citycatalyst.structured-document.1"),
    );
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        annotationMode: "visual_context",
        resultS3Key: markdownKey,
        structuredS3Key: structuredKey,
        structuredSchemaVersion: "citycatalyst.structured-document.1",
      }),
      expect.objectContaining({
        where: expect.objectContaining({
          status: "running",
          sourceId: uploadId,
        }),
      }),
    );
    const successCall = pdfOcrUpdate.mock.invocationCallOrder[0];
    const secondPut = putTextFile.mock.invocationCallOrder[1];
    expect(secondPut).toBeLessThan(successCall);
  });

  it("stores page headers and footers in the Markdown and hashes that text", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: uploadId,
      annotationMode: "visual_context",
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    const markdown =
      "<!-- page: 1 -->\nCity Plan\n\n# Plan\n\nFunded by grant 101036519";
    convertPdfUrlToMarkdown.mockResolvedValue({ ...ocrResult(), markdown });

    await processPdfOcrJobs();

    const stored = putTextFile.mock.calls[0][1] as string;
    expect(stored).toContain("City Plan");
    expect(stored).toContain("grant 101036519");
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        resultSha256: createHash("sha256").update(markdown).digest("hex"),
        resultSizeBytes: Buffer.byteLength(markdown),
      }),
      expect.anything(),
    );
  });

  it("keeps GHGI OCR non-annotated and extracts only from Markdown", async () => {
    const job = claimableJob({
      sourceType: "inventory_import",
      sourceId: "11111111-1111-4111-8111-111111111111",
      annotationMode: "none",
    });
    stubPdfSource();
    importedFindByPk.mockResolvedValue({
      fileType: "pdf",
      s3Key: "inventory/source.pdf",
      fileSize: 12,
    });
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    convertPdfUrlToMarkdown.mockResolvedValue(ocrResult());

    await processPdfOcrJobs();

    expect(convertPdfUrlToMarkdown).toHaveBeenCalledWith(
      "https://signed.example/source.pdf",
      "none",
    );
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ annotationMode: "none" }),
      expect.anything(),
    );
  });

  it("does not register a success when the lease is lost after both objects are written", async () => {
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: "22222222-2222-4222-8222-222222222222",
      annotationMode: "visual_context",
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    convertPdfUrlToMarkdown.mockResolvedValue(ocrResult());
    pdfOcrUpdate.mockResolvedValueOnce([0]).mockResolvedValueOnce([0]);

    await processPdfOcrJobs();

    expect(putTextFile).toHaveBeenCalledTimes(2);
    expect(pdfOcrUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "succeeded" }),
      expect.objectContaining({
        where: expect.objectContaining({ status: "running" }),
      }),
    );
    expect(pdfOcrUpdate).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({
        status: "succeeded",
        structuredS3Key: expect.anything(),
      }),
      expect.objectContaining({
        where: expect.objectContaining({ leaseOwner: expect.any(String) }),
      }),
    );
  });

  it("retries a missing annotation and never succeeds as Markdown-only", async () => {
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: "22222222-2222-4222-8222-222222222222",
      annotationMode: "visual_context",
      attemptCount: 0,
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    convertPdfUrlToMarkdown.mockRejectedValue(
      new MistralOcrError("annotation_invalid", true, "missing annotation"),
    );

    await processPdfOcrJobs();

    expect(putTextFile).not.toHaveBeenCalled();
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        errorCode: "annotation_invalid",
      }),
      expect.anything(),
    );
    const retryValues = pdfOcrUpdate.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(retryValues).not.toHaveProperty("resultS3Key");
    expect(retryValues).not.toHaveProperty("structuredS3Key");
    expect(retryValues.status).toBe("queued");
  });

  it("fails the upload explicitly after the annotation retry limit is exhausted", async () => {
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: "22222222-2222-4222-8222-222222222222",
      annotationMode: "visual_context",
      attemptCount: 2,
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    convertPdfUrlToMarkdown.mockRejectedValue(
      new MistralOcrError("annotation_invalid", true, "missing annotation"),
    );

    await processPdfOcrJobs();

    expect(putTextFile).not.toHaveBeenCalled();
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "annotation_invalid",
      }),
      expect.anything(),
    );
  });

  it("fails an oversized structured artifact without writing either object", async () => {
    const previous = process.env.PDF_OCR_STRUCTURED_MAX_BYTES;
    process.env.PDF_OCR_STRUCTURED_MAX_BYTES = "20";
    const job = claimableJob({
      sourceType: "concept_note_upload",
      sourceId: "22222222-2222-4222-8222-222222222222",
      annotationMode: "visual_context",
    });
    stubPdfSource();
    findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    convertPdfUrlToMarkdown.mockResolvedValue(ocrResult());

    try {
      await processPdfOcrJobs();
    } finally {
      if (previous === undefined) {
        delete process.env.PDF_OCR_STRUCTURED_MAX_BYTES;
      } else {
        process.env.PDF_OCR_STRUCTURED_MAX_BYTES = previous;
      }
    }

    expect(putTextFile).not.toHaveBeenCalled();
    expect(pdfOcrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "structured_artifact_too_large",
      }),
      expect.anything(),
    );
  });
});

function claimableJob(values: Record<string, unknown>): {
  update: (next: Record<string, unknown>) => Promise<void>;
} & Record<string, unknown> {
  const job: {
    update: (next: Record<string, unknown>) => Promise<void>;
  } & Record<string, unknown> = {
    id: "job-1",
    status: "queued",
    attemptCount: 0,
    update: async (next) => {
      Object.assign(job, next);
    },
    ...values,
  };
  return job;
}

function stubPdfSource(): void {
  getFileMetadata.mockResolvedValue({
    ContentLength: 12,
    ContentType: "application/pdf",
  });
  getFilePrefix.mockResolvedValue(Buffer.from("%PDF-"));
  createSignedDownloadUrl.mockResolvedValue(
    "https://signed.example/source.pdf",
  );
  pdfFindByPk.mockResolvedValue(null);
}

function ocrResult(): {
  markdown: string;
  pageCount: number;
  model: string;
  structured: { schema_version: string };
} {
  return {
    markdown: "# Plan",
    pageCount: 1,
    model: "mistral-ocr-latest",
    structured: { schema_version: "citycatalyst.structured-document.1" },
  };
}
