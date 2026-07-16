import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
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
  default: { getTextFile },
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
let claimPdfOcrJobs: typeof import("@/backend/PdfOcrService").claimPdfOcrJobs;
let claimInventoryExtractionJobs: typeof import("@/backend/PdfOcrService").claimInventoryExtractionJobs;
let getInventoryPdfOcrStatus: typeof import("@/backend/PdfOcrService").getInventoryPdfOcrStatus;
let extractInventoryRowsFromStoredMarkdown: typeof import("@/backend/PdfOcrService").extractInventoryRowsFromStoredMarkdown;

beforeAll(async () => {
  ({
    enqueueInventoryPdfOcr,
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
      ["createdAt", "ASC"],
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
