/**
 * CC-1008: PDF rows reach InventoryImportService through fromExtractedRows.
 * Scope 2 and 3 must stay on their own GPC reference and notation keys must survive.
 * The database is mocked; only the row mapping is under test.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      Scope: {
        findAll: async () => [
          { scopeId: "scope-1-id", scopeName: "1" },
          { scopeId: "scope-2-id", scopeName: "2" },
          { scopeId: "scope-3-id", scopeName: "3" },
        ],
      },
    },
  },
}));

const { default: ECRFImportService } =
  await import("@/backend/ECRFImportService");
const { applyRowOverrides } = await import("@/backend/ImportResultBuilder");
const { previewImportRows } = await import("@/backend/ImportRowPreviewService");

describe("ECRFImportService.fromExtractedRows", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps scope 1, 2 and 3 of one sub-sector on I.1.1, I.1.2 and I.1.3", async () => {
    jest
      .spyOn(ECRFImportService, "lookupGPCReference")
      .mockImplementation(async (gpcRefNo: string) => ({
        sectorId: "sector",
        subsectorId: "subsector",
        subcategoryId: `sub-${gpcRefNo}`,
        scopeId: "scope-1-id",
      }));

    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2021,
        sector: "Stationary Energy",
        subsector: "Residential Buildings",
        scope: "1",
        category: "Residential Buildings",
        totalCO2e: 196407,
      },
      {
        year: 2021,
        sector: "Stationary Energy",
        subsector: "Residential Buildings",
        scope: "2",
        category: "Residential Buildings",
        totalCO2e: 450523,
      },
      {
        year: 2021,
        sector: "Stationary Energy",
        subsector: "Residential Buildings",
        scope: "3",
        category: "Residential Buildings",
        totalCO2e: 33017,
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(
      result.rows.map((r) => [r.gpcRefNo, r.scopeId, r.totalCO2e]),
    ).toEqual([
      ["I.1.1", "scope-1-id", 196407],
      ["I.1.2", "scope-2-id", 450523],
      ["I.1.3", "scope-3-id", 33017],
    ]);
  });

  it("imports a notation key row without a value", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector",
      subsectorId: "subsector",
      subcategoryId: "sub",
      scopeId: "scope-2-id",
    });

    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2021,
        sector: "Transportation",
        subsector: "Aviation",
        scope: "2",
        gpcRefNo: "II.4.2",
        category: "Aviation",
        totalCO2e: null,
        notationKey: "IE",
      },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].gpcRefNo).toBe("II.4.2");
    expect(result.rows[0].notationKey).toBe("IE");
    expect(result.rows[0].totalCO2e).toBeUndefined();
  });
});

describe("fromExtractedRows review data", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockLookup() {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector",
      subsectorId: "subsector",
      subcategoryId: "sub",
      scopeId: "scope-3-id",
    });
  }

  it("carries activity class and the inferred scope onto review", async () => {
    mockLookup();
    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2021,
        sector: "Stationary Energy",
        subsector: "Energy generation",
        scope: "3",
        category: "Electricity T&D Losses",
        gpcRefNo: "I.6.3",
        totalCO2e: 100,
        activityClass: "td_losses",
        scopeSource: "inferred",
        originalScope: "1",
      },
    ]);
    expect(result.rows[0].review).toMatchObject({
      activityClass: "td_losses",
      scopeSource: "inferred",
      originalScope: "1",
      scope: "3",
    });
  });

  it("leaves activityClass off review for a row that has none", async () => {
    mockLookup();
    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2021,
        sector: "Stationary Energy",
        subsector: "Residential Buildings",
        scope: "1",
        category: "Residential Buildings",
        totalCO2e: 10,
      },
    ]);
    expect("activityClass" in result.rows[0].review!).toBe(false);
  });
});

describe("manual override of a row with an inferred scope", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const inferred = {
    year: 2021,
    sector: "Stationary Energy",
    subsector: "Non-Specified Sources",
    scope: "2",
    originalScope: "1",
    category: "Electricity",
    gpcRefNo: "I.6.2",
    refSource: "inferred" as const,
    totalCO2e: 100,
    activityClass: "grid_energy" as const,
    scopeSource: "inferred" as const,
  };

  async function previewOf(row: typeof inferred) {
    jest
      .spyOn(ECRFImportService, "lookupGPCReference")
      .mockImplementation(async (gpcRefNo: string) => ({
        sectorId: "sector",
        subsectorId: "subsector",
        subcategoryId: `sub-${gpcRefNo}`,
        scopeId: gpcRefNo.endsWith(".2") ? "scope-2-id" : "scope-3-id",
      }));
    const result = await ECRFImportService.fromExtractedRows([row]);
    result.requiresReferenceReview = true;
    return { result, preview: await previewImportRows(result, undefined) };
  }

  it.each([
    ["scope", { scope: "3", gpcRefNo: "I.6.3" }],
    ["reference", { gpcRefNo: "I.1.2", subsector: "Residential Buildings" }],
  ])(
    "drops the inferred flag when the user changes the %s",
    async (_k, edit) => {
      const out = applyRowOverrides(inferred, edit, "file", "tok");
      expect(out.scopeSource).toBeNull();

      const { result, preview } = await previewOf(out as typeof inferred);
      expect(preview.inferredScopeRows).toEqual([]);
      // The stated scope is the row's current one, not the model's original "1".
      expect(result.rows[0].review?.scope).toBe(out.scope);
      expect(preview.reviewRows).toEqual([]);
    },
  );

  it("keeps the inferred flag when the user edits another field", async () => {
    const out = applyRowOverrides(
      inferred,
      { category: "Grid electricity" },
      "file",
      "tok",
    );
    expect(out.scopeSource).toBe("inferred");

    const { preview } = await previewOf(out as typeof inferred);
    expect(preview.inferredScopeRows).toHaveLength(1);
  });
});
