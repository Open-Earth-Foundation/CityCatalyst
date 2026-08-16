import { createHash } from "node:crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const catalogModel = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};
const importedFileModel = { findByPk: jest.fn() };
const pdfOcrJobModel = { findAll: jest.fn() };

const mockDb = {
  models: {
    NativeInputCatalog: catalogModel,
    ImportedInventoryFile: importedFileModel,
    PdfOcrJob: pdfOcrJobModel,
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
const resolveImportedFileBuffer = jest.fn();
jest.unstable_mockModule("@/backend/InventoryFileStorageService", () => ({
  __esModule: true,
  default: { resolveImportedFileBuffer },
}));
jest.mock("@/backend/InventoryFileStorageService", () => ({
  __esModule: true,
  default: { resolveImportedFileBuffer },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

let registerGHGIImportedInventorySource: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIImportedInventorySource;
let registerGHGIInventory: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIInventory;
let registerGHGIOcrArtifact: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIOcrArtifact;
let withdrawGHGICatalogForInventory: typeof import("@/backend/GHGINativeInputCatalogService").withdrawGHGICatalogForInventory;
let syncGHGIImportedInventorySource: typeof import("@/backend/GHGINativeInputCatalogService").syncGHGIImportedInventorySource;
let syncPendingGHGIOcrArtifacts: typeof import("@/backend/GHGINativeInputCatalogService").syncPendingGHGIOcrArtifacts;

beforeAll(async () => {
  ({
    registerGHGIImportedInventorySource,
    registerGHGIInventory,
    registerGHGIOcrArtifact,
    withdrawGHGICatalogForInventory,
    syncGHGIImportedInventorySource,
    syncPendingGHGIOcrArtifacts,
  } = await import("@/backend/GHGINativeInputCatalogService"));
});

afterEach(() => {
  jest.clearAllMocks();
});

const ids = {
  userId: "11111111-1111-4111-8111-111111111111",
  cityId: "22222222-2222-4222-8222-222222222222",
  inventoryId: "33333333-3333-4333-8333-333333333333",
};

function makeImportedFile(overrides: Record<string, unknown> = {}) {
  const importedFile = {
    id: "44444444-4444-4444-8444-444444444444",
    ...ids,
    fileName: "stored-report.pdf",
    originalFileName: "report.pdf",
    fileType: "pdf",
    s3Key: "imports/city/inventory/report.pdf",
    importStatus: "completed",
    completedAt: new Date("2026-08-07T12:00:00.000Z"),
    ...overrides,
  } as Record<string, unknown> & { update: jest.Mock };
  importedFile.update = jest.fn(async (values: Record<string, unknown>) => {
    Object.assign(importedFile, values);
  });
  return importedFile as never;
}

describe("GHGI NativeInputCatalog adapter", () => {
  beforeEach(() => {
    catalogModel.create.mockReset();
    catalogModel.findAll.mockReset();
    catalogModel.findOne.mockReset();
    catalogModel.update.mockReset();
    importedFileModel.findByPk.mockReset();
    pdfOcrJobModel.findAll.mockReset();
    resolveImportedFileBuffer.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue({ id: "catalog-default" });
    catalogModel.findAll.mockResolvedValue([]);
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.update.mockResolvedValue([0]);
    importedFileModel.findByPk.mockResolvedValue(null);
    pdfOcrJobModel.findAll.mockResolvedValue([]);
  });

  it("registers the uploaded source as a separate immutable pointer", async () => {
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue({ id: "catalog-source" });

    await registerGHGIImportedInventorySource(
      makeImportedFile(),
      "source-sha256",
    );

    expect(catalogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "inventory_source_file",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "44444444-4444-4444-8444-444444444444",
        contentDigest: "source-sha256",
        markdownReady: false,
        inventoryId: ids.inventoryId,
        cityId: ids.cityId,
      }),
      expect.anything(),
    );
  });

  it("preserves the source digest when the first catalog write fails", async () => {
    const importedFile = makeImportedFile({
      contentDigest: null,
      data: Buffer.from("source-file"),
    });
    const expectedDigest = createHash("sha256")
      .update("source-file")
      .digest("hex");
    resolveImportedFileBuffer.mockResolvedValue(Buffer.from("source-file"));
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockRejectedValueOnce(new Error("temporary failure"));

    await expect(
      syncGHGIImportedInventorySource(importedFile),
    ).resolves.toBeNull();

    catalogModel.create.mockResolvedValue({ id: "catalog-source" });
    await expect(
      syncGHGIImportedInventorySource(importedFile),
    ).resolves.toEqual(expect.objectContaining({ created: true }));

    expect(importedFile.update).toHaveBeenCalledWith({
      contentDigest: expectedDigest,
    });
    expect(catalogModel.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentDigest: expectedDigest }),
      expect.anything(),
    );
  });

  it("only registers the structured inventory after completion", async () => {
    await expect(
      registerGHGIInventory(makeImportedFile({ importStatus: "importing" })),
    ).rejects.toThrow("Only completed GHGI imports");

    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue({ id: "catalog-inventory" });
    await registerGHGIInventory(makeImportedFile());

    expect(catalogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "inventory_import",
        sourceType: "inventory",
        sourceId: ids.inventoryId,
        markdownReady: null,
      }),
      expect.anything(),
    );
  });

  it("uses the PdfOcrJob id and result provenance for readable Markdown", async () => {
    importedFileModel.findByPk.mockResolvedValue(makeImportedFile());
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue({ id: "catalog-ocr" });

    await registerGHGIOcrArtifact({
      id: "55555555-5555-4555-8555-555555555555",
      sourceType: "inventory_import",
      sourceId: "44444444-4444-4444-8444-444444444444",
      status: "succeeded",
      resultS3Key:
        "pdf-ocr/results/inventory_import/file/1/combined_markdown.md",
      resultSha256: "ocr-sha256",
      pageCount: 12,
      resultSizeBytes: 1234,
      model: "mistral-ocr-latest",
    } as never);

    expect(catalogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "inventory_ocr",
        sourceType: "pdf_ocr_job",
        sourceId: "55555555-5555-4555-8555-555555555555",
        contentDigest: "ocr-sha256",
        markdownReady: true,
        labels: expect.objectContaining({ pageCount: 12 }),
      }),
      expect.anything(),
    );
  });

  it("skips registered OCR jobs before applying the retry limit", async () => {
    const oldJob = {
      id: "ocr-old",
      sourceType: "inventory_import",
      sourceId: "44444444-4444-4444-8444-444444444444",
      status: "succeeded",
      resultS3Key: "old.md",
      resultSha256: "old-sha256",
      pageCount: 1,
    };
    const newerJob = {
      ...oldJob,
      id: "ocr-new",
      resultS3Key: "new.md",
      resultSha256: "new-sha256",
    };
    catalogModel.findAll.mockResolvedValue([{ sourceId: oldJob.id }]);
    pdfOcrJobModel.findAll
      .mockResolvedValueOnce([oldJob])
      .mockResolvedValueOnce([newerJob]);
    importedFileModel.findByPk.mockResolvedValue(makeImportedFile());
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.create.mockResolvedValue({ id: "catalog-ocr" });

    await expect(syncPendingGHGIOcrArtifacts(1)).resolves.toHaveLength(1);

    expect(catalogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: newerJob.id,
        contentDigest: newerJob.resultSha256,
      }),
      expect.anything(),
    );
    expect(pdfOcrJobModel.findAll).toHaveBeenCalledTimes(2);
  });

  it("withdraws active GHGI catalog entries before inventory deletion", async () => {
    catalogModel.update.mockResolvedValue([2]);

    await expect(
      withdrawGHGICatalogForInventory(ids.inventoryId),
    ).resolves.toBe(2);

    expect(catalogModel.update).toHaveBeenCalledWith(
      { availability: "withdrawn" },
      expect.objectContaining({
        where: expect.objectContaining({
          owningModule: "ghgi",
          inventoryId: ids.inventoryId,
          availability: "active",
        }),
      }),
    );
  });
});
