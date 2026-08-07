import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const catalogModel = {
  create: jest.fn(),
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

let registerGHGIImportedInventorySource: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIImportedInventorySource;
let registerGHGIInventory: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIInventory;
let registerGHGIOcrArtifact: typeof import("@/backend/GHGINativeInputCatalogService").registerGHGIOcrArtifact;
let withdrawGHGICatalogForInventory: typeof import("@/backend/GHGINativeInputCatalogService").withdrawGHGICatalogForInventory;

beforeAll(async () => {
  ({
    registerGHGIImportedInventorySource,
    registerGHGIInventory,
    registerGHGIOcrArtifact,
    withdrawGHGICatalogForInventory,
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
  return {
    id: "44444444-4444-4444-8444-444444444444",
    ...ids,
    fileName: "stored-report.pdf",
    originalFileName: "report.pdf",
    fileType: "pdf",
    s3Key: "imports/city/inventory/report.pdf",
    importStatus: "completed",
    completedAt: new Date("2026-08-07T12:00:00.000Z"),
    ...overrides,
  } as never;
}

describe("GHGI NativeInputCatalog adapter", () => {
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
