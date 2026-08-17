import {
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
const resolveImportedFileBuffer = jest.fn<AsyncMock>();
const extractRows = jest.fn<AsyncMock>();
const convertPdfUrlToMarkdown = jest.fn<AsyncMock>();

jest.unstable_mockModule("@/models", () => ({
  db: {
    sequelize: { transaction },
    models: {
      PdfOcrJob: { findOrCreate, findOne, findAll, update: pdfOcrUpdate },
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
  default: { getTextFile, putTextFile, resolveImportedFileBuffer },
}));
jest.unstable_mockModule("@/backend/MistralOcrService", () => ({
  MistralOcrError: class extends Error {},
  convertPdfUrlToMarkdown,
}));
jest.unstable_mockModule("@/backend/InventoryExtractionService", () => ({
  extractInventoryRowsFromDocument: extractRows,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
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
      }),
    );
    expect(importedFile.update).toHaveBeenCalledWith(
      expect.objectContaining({ importStatus: "extracting" }),
    );
  });

  it("uses the upload identity for one CA-delivered CNB OCR job", async () => {
    const uploadId = "22222222-2222-4222-8222-222222222222";
    const job = { status: "queued" };
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
      .mockResolvedValueOnce([{ sector: "Energy", totalCO2e: 12 }]);
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
    expect(getTextFile).toHaveBeenCalledTimes(2);
    expect(convertPdfUrlToMarkdown).not.toHaveBeenCalled();
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
    extractRows.mockResolvedValue([{ sector: "Energy", totalCO2e: 12 }]);
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
});
