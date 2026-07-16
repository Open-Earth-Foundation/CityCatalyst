import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const findOrCreate = jest.fn<any>();
const findOne = jest.fn<any>();
const findAll = jest.fn<any>();
const transaction = jest.fn<any>();
const importedFindByPk = jest.fn<any>();
const inventoryFindByPk = jest.fn<any>();
const getTextFile = jest.fn<any>();
const extractRows = jest.fn<any>();
const convertPdfUrlToMarkdown = jest.fn<any>();

jest.unstable_mockModule("@/models", () => ({
  db: {
    sequelize: { transaction },
    models: {
      PdfOcrJob: { findOrCreate, findOne, findAll, update: jest.fn() },
      ImportedInventoryFile: {
        findByPk: importedFindByPk,
        update: jest.fn(),
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
let getInventoryPdfOcrStatus: typeof import("@/backend/PdfOcrService").getInventoryPdfOcrStatus;
let extractInventoryRowsFromStoredMarkdown: typeof import("@/backend/PdfOcrService").extractInventoryRowsFromStoredMarkdown;

beforeAll(async () => {
  ({
    enqueueInventoryPdfOcr,
    claimPdfOcrJobs,
    getInventoryPdfOcrStatus,
    extractInventoryRowsFromStoredMarkdown,
  } = await import("@/backend/PdfOcrService"));
});

describe("PdfOcrJob queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the composite source identity and idempotent find-or-create", async () => {
    const job = { status: "queued" };
    findOrCreate.mockResolvedValue([job, false]);
    const importedFile = {
      id: "11111111-1111-4111-8111-111111111111",
      update: jest.fn<any>().mockResolvedValue(undefined),
    } as any;
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
      update: jest.fn<any>().mockResolvedValue(undefined),
    }));
    findAll.mockResolvedValue(jobs);
    transaction.mockImplementation(async (callback: any) =>
      callback({ LOCK: { UPDATE: "UPDATE" } }),
    );
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
      update: jest.fn<any>().mockImplementation(async (values: any) => {
        Object.assign(importedFile, values);
      }),
    };
    const job = {
      sourceId: "source-id",
      status: "succeeded",
      resultS3Key: "result.md",
    } as any;
    importedFindByPk.mockResolvedValue(importedFile);
    inventoryFindByPk.mockResolvedValue({ year: 2024 });
    getTextFile.mockResolvedValue(
      "<!-- page: 1 -->\n| Sector | tCO2e |\n|---|---:|\n| Energy | 12 |",
    );
    extractRows
      .mockRejectedValueOnce(new Error("row extraction failed"))
      .mockResolvedValueOnce([{ sector: "Energy", totalCO2e: 12 }]);

    await extractInventoryRowsFromStoredMarkdown(job);
    expect(importedFile.importStatus).toBe("failed");
    expect(job.status).toBe("succeeded");

    importedFile.importStatus = "extracting";
    await extractInventoryRowsFromStoredMarkdown(job);
    expect(importedFile.importStatus).toBe("waiting_for_approval");
    expect(getTextFile).toHaveBeenCalledTimes(2);
    expect(convertPdfUrlToMarkdown).not.toHaveBeenCalled();
  });
});
