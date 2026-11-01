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
