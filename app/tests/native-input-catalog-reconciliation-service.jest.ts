import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const catalogModel = { findAll: jest.fn() };
const importedFileModel = { findAll: jest.fn() };
const ocrJobModel = { findAll: jest.fn() };
const rankingModel = { findAll: jest.fn() };
const actionPlanModel = { findAll: jest.fn() };
const rankedModel = { findAll: jest.fn() };
const unrankedModel = { findAll: jest.fn() };
const registerNativeInput = jest.fn();

const mockDb = {
  models: {
    NativeInputCatalog: catalogModel,
    ImportedInventoryFile: importedFileModel,
    PdfOcrJob: ocrJobModel,
    HighImpactActionRanking: rankingModel,
    ActionPlan: actionPlanModel,
    HighImpactActionRanked: rankedModel,
    UnrankedActionSelection: unrankedModel,
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
}));
jest.mock("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
}));

const ghgiInput = {
  kind: "inventory_source_file",
  owningModule: "ghgi",
  sourceType: "imported_inventory_file",
  sourceId: "file-1",
  userId: "user-1",
  inventoryId: "inventory-1",
  cityId: "city-1",
  labels: null,
};

jest.unstable_mockModule("@/backend/GHGINativeInputCatalogService", () => ({
  buildGHGIImportedInventorySourceInput: jest.fn(() => ghgiInput),
  buildGHGIInventoryInput: jest.fn(),
  buildGHGIOcrArtifactInput: jest.fn(),
}));
jest.mock("@/backend/GHGINativeInputCatalogService", () => ({
  buildGHGIImportedInventorySourceInput: jest.fn(() => ghgiInput),
  buildGHGIInventoryInput: jest.fn(),
  buildGHGIOcrArtifactInput: jest.fn(),
}));

jest.unstable_mockModule(
  "@/backend/hiap/HiapNativeInputCatalogService",
  () => ({
    buildHIAPActionPlanInput: jest.fn(),
    buildHIAPRankingInput: jest.fn(),
    buildHIAPSelectionInput: jest.fn(),
    resolveHIAPCatalogScope: jest.fn(),
  }),
);
jest.mock("@/backend/hiap/HiapNativeInputCatalogService", () => ({
  buildHIAPActionPlanInput: jest.fn(),
  buildHIAPRankingInput: jest.fn(),
  buildHIAPSelectionInput: jest.fn(),
  resolveHIAPCatalogScope: jest.fn(),
}));

jest.unstable_mockModule("@/services/logger", () => ({
  logger: { info: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { info: jest.fn() },
}));

let reconcileNativeInputCatalog: typeof import("@/backend/NativeInputCatalogReconciliationService").reconcileNativeInputCatalog;

beforeAll(async () => {
  ({ reconcileNativeInputCatalog } =
    await import("@/backend/NativeInputCatalogReconciliationService"));
});

beforeEach(() => {
  catalogModel.findAll.mockResolvedValue([]);
  importedFileModel.findAll.mockImplementation(
    (options: { where?: unknown }) =>
      options.where && Object.keys(options.where).length > 0
        ? []
        : [{ id: "file-1", contentDigest: null }],
  );
  ocrJobModel.findAll.mockResolvedValue([]);
  rankingModel.findAll.mockResolvedValue([]);
  actionPlanModel.findAll.mockResolvedValue([]);
  rankedModel.findAll.mockResolvedValue([]);
  unrankedModel.findAll.mockResolvedValue([]);
  registerNativeInput.mockResolvedValue({
    catalog: { id: "catalog-created" },
    created: true,
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("NativeInputCatalog reconciliation", () => {
  it("reports missing registrations without writing in dry-run", async () => {
    const report = await reconcileNativeInputCatalog({
      mode: "dry-run",
      limit: 10,
    });

    expect(report.counts.missing).toBe(1);
    expect(report.counts.repaired).toBe(0);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("continues across deterministic pages and emits an aggregate page report", async () => {
    let importedFilePageCalls = 0;
    importedFileModel.findAll.mockImplementation(
      (options: { where?: Record<string, unknown> }) => {
        if (options.where && Object.keys(options.where).length > 0) return [];

        importedFilePageCalls++;
        const first = {
          id: "file-page-1",
          contentDigest: null,
          created: "2026-01-01T00:00:00.000Z",
        };
        const second = {
          id: "file-page-2",
          contentDigest: null,
          created: "2026-01-02T00:00:00.000Z",
        };
        return importedFilePageCalls === 1 ? [first, second] : [second];
      },
    );

    const report = await reconcileNativeInputCatalog({
      mode: "dry-run",
      limit: 1,
    });

    expect(report.complete).toBe(true);
    expect(report.pagesProcessed).toBe(2);
    expect(report.pageSummaries).toHaveLength(2);
    expect(report.recordsScanned).toBe(2);
    expect(report.counts.missing).toBe(1);
  });

  it("repairs a deterministic missing registration in apply mode", async () => {
    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts.repaired).toBe(1);
    expect(registerNativeInput).toHaveBeenCalledWith(ghgiInput);
  });

  it("does not write again when a rerun finds the registration", async () => {
    await reconcileNativeInputCatalog({ mode: "apply" });
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-created",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "file-1",
        userId: "user-1",
        inventoryId: "inventory-1",
        cityId: "city-1",
        availability: "active",
      },
    ]);

    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts.matched).toBe(1);
    expect(registerNativeInput).toHaveBeenCalledTimes(1);
  });

  it("does not recreate a registration that was withdrawn", async () => {
    importedFileModel.findAll.mockImplementation(
      (options: { where?: Record<string, unknown> }) =>
        options.where && Object.keys(options.where).length > 0
          ? []
          : [
              {
                id: "file-1",
                importStatus: "uploaded",
                contentDigest: null,
              },
            ],
    );
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-withdrawn",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "file-1",
        availability: "withdrawn",
      },
    ]);

    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts.skipped).toBe(1);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("does not repair a failed GHGI import", async () => {
    importedFileModel.findAll.mockImplementation(
      (options: { where?: Record<string, unknown> }) =>
        options.where && Object.keys(options.where).length > 0
          ? []
          : [
              {
                id: "file-1",
                importStatus: "failed",
                contentDigest: null,
              },
            ],
    );

    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts.skipped).toBe(1);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("reports duplicates and dangling entries without repairing them", async () => {
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-1",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "file-1",
        availability: "active",
      },
      {
        id: "catalog-2",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "file-1",
        availability: "active",
      },
      {
        id: "catalog-dangling",
        owningModule: "ghgi",
        sourceType: "inventory",
        sourceId: "inventory-gone",
        availability: "active",
      },
    ]);

    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts.dangling).toBe(1);
    expect(report.counts.duplicate).toBe(1);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("reports scope inconsistencies without applying a repair", async () => {
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-scope-mismatch",
        owningModule: "ghgi",
        sourceType: "imported_inventory_file",
        sourceId: "file-1",
        userId: "user-1",
        inventoryId: "different-inventory",
        cityId: "city-1",
        availability: "active",
      },
    ]);

    const report = await reconcileNativeInputCatalog({ mode: "apply" });

    expect(report.counts["scope-inconsistent"]).toBe(1);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("does not apply when the bounded catalog scan cannot resolve the source", async () => {
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-outside-page",
        owningModule: "ghgi",
        sourceType: "inventory",
        sourceId: "inventory-elsewhere",
        availability: "active",
        created: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "catalog-outside-page-2",
        owningModule: "ghgi",
        sourceType: "inventory",
        sourceId: "inventory-elsewhere-2",
        availability: "active",
        created: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const report = await reconcileNativeInputCatalog({
      mode: "apply",
      limit: 1,
    });

    expect(report.truncated).toBe(true);
    expect(report.counts.ambiguous).toBe(1);
    expect(registerNativeInput).not.toHaveBeenCalled();
  });
});
