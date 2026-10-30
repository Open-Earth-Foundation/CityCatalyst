/**
 * CC-1201: III.x.2 (generated inside, treated outside) and III.x.3 (generated
 * outside, treated inside) must not be confused: a wrong .3 drops an amount from
 * the total, and scope alone cannot separate .3 from .1.
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      Scope: { findAll: async () => [] },
    },
  },
}));

const { default: ECRFImportService } =
  await import("@/backend/ECRFImportService");
const { previewImportRows } = await import("@/backend/ImportRowPreviewService");
const { sumImported } = await import("@/backend/InventoryExtractionService");
const { correctWasteDirection, resolveGpcRefFromLabels } =
  await import("@/util/GHGI/gpc-ref-resolver");
const { isBreakdownEmpty } = await import("@/util/GHGI/reported-totals");
const { MANUAL_INPUT_HIERARCHY } = await import("@/util/form-schema");
const { default: GPC_REFERENCE_TABLE } =
  await import("@/util/GHGI/data/gpc-reference-table.json");

const OUTSIDE_IN = [
  "Waste generated outside the city boundary and disposed in landfills within the city boundary",
  "Wastewater generated outside the city but treated within the city",
  "Imported waste",
];
const INSIDE_OUT = [
  "Solid waste generated within the city boundary but disposed in landfills outside the city boundary",
  "Wastewater generated in the city and treated outside",
  "Exported waste",
];

describe("correctWasteDirection", () => {
  it.each(OUTSIDE_IN)("reads outside to inside: %s", (label) => {
    expect(correctWasteDirection("III.1.2", [label])).toBe("III.1.3");
    expect(correctWasteDirection("III.1.3", [label])).toBe("III.1.3");
    expect(correctWasteDirection("III.1.1", [label])).toBe("III.1.3");
  });

  it.each(INSIDE_OUT)("reads inside to outside: %s", (label) => {
    expect(correctWasteDirection("III.4.3", [label])).toBe("III.4.2");
    expect(correctWasteDirection("III.4.2", [label])).toBe("III.4.2");
  });

  it("leaves a row without a direction and other sectors alone", () => {
    expect(correctWasteDirection("III.1.3", ["Landfill"])).toBe("III.1.3");
    expect(correctWasteDirection("III.1.2", [null, undefined])).toBe("III.1.2");
    expect(correctWasteDirection("I.1.3", OUTSIDE_IN)).toBe("I.1.3");
    expect(correctWasteDirection("VI.1", OUTSIDE_IN)).toBe("VI.1");
  });
});

describe("waste reference resolution from labels", () => {
  const solidWaste = { sector: "Waste", subsector: "Solid Waste Disposal" };

  it("keeps scope 1 on III.x.1, not on the restored III.x.3", () => {
    expect(resolveGpcRefFromLabels({ ...solidWaste, scopeLabel: "1" })).toBe(
      "III.1.1",
    );
    expect(resolveGpcRefFromLabels({ ...solidWaste, scopeLabel: "3" })).toBe(
      "III.1.2",
    );
  });

  it("uses the stated direction", () => {
    expect(
      resolveGpcRefFromLabels({
        ...solidWaste,
        scopeLabel: "1",
        fuelTypeOrActivity: OUTSIDE_IN[0],
      }),
    ).toBe("III.1.3");
  });

  it("resolves Other Scope 3 labels", () => {
    expect(
      resolveGpcRefFromLabels({
        sector: "Other Scope 3",
        subsector: "Other Scope 3",
      }),
    ).toBe("VI.1");
  });

  it("corrects a copied reference that the row label contradicts", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector",
      subsectorId: "subsector",
      subcategoryId: "subcategory",
      scopeId: "scope",
    });
    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2022,
        sector: "Waste",
        subsector: "Solid Waste Disposal",
        gpcRefNo: "III.1.3",
        category: INSIDE_OUT[0],
        totalCO2e: 5,
      },
    ]);
    expect(result.rows[0].gpcRefNo).toBe("III.1.2");
    jest.restoreAllMocks();
  });
});

describe("import reconciliation sum", () => {
  it("leaves out every omitted reference, with or without spaces", () => {
    const rows = [
      { gpcRefNo: "III.1.1", totalCO2e: 100 },
      { gpcRefNo: "III.1.2", totalCO2e: 10 },
      { gpcRefNo: "III.4.3", totalCO2e: 7 },
      { gpcRefNo: " VI.1 ", totalCO2e: 5 },
      { gpcRefNo: "I.4.4", totalCO2e: 3 },
      { gpcRefNo: null, totalCO2e: 1 },
    ];
    expect(sumImported(rows as never)).toBe(111);
  });
});

describe("import review", () => {
  it("shows III.x.3 and VI.1 as not counted, and no other row", async () => {
    const base = {
      sectorId: "s",
      subsectorId: "ss",
      subcategoryId: null,
      scopeId: "scope",
      totalCO2e: 1,
    };
    const preview = await previewImportRows(
      {
        rows: [
          { ...base, gpcRefNo: "III.1.1", rowIndex: 0 },
          { ...base, gpcRefNo: "III.4.3", rowIndex: 1 },
          { ...base, gpcRefNo: "VI.1", rowIndex: 2 },
        ],
        errors: [],
        warnings: [],
        rowCount: 3,
        validRowCount: 3,
      } as never,
      undefined,
    );
    expect(preview.skippedRows).toBe(0);
    expect(
      preview.rows.map((row) => [row.gpcRefNo, row.status, row.issue]),
    ).toEqual([
      ["III.4.3", "not-counted", "omitted-from-total"],
      ["VI.1", "not-counted", "omitted-from-total"],
    ]);
  });
});

describe("empty results state", () => {
  it("is not empty when only omitted rows exist", () => {
    expect(isBreakdownEmpty(undefined)).toBe(true);
    expect(isBreakdownEmpty({ byScope: [], omittedFromTotal: [] })).toBe(true);
    expect(isBreakdownEmpty({ byScope: [], omittedFromTotal: [{}] })).toBe(
      false,
    );
    expect(isBreakdownEmpty({ byScope: [{}], omittedFromTotal: [] })).toBe(
      false,
    );
  });
});

describe("waste manual forms", () => {
  it.each([1, 2, 3, 4])("III.%i.3 reuses the III.x.1 form", (n) => {
    const form = MANUAL_INPUT_HIERARCHY[`III.${n}.3`];
    expect(form).toEqual(MANUAL_INPUT_HIERARCHY[`III.${n}.1`]);
    expect(form.scope).toBe(1);
  });

  it.each([1, 2, 3, 4])("III.%i.2 stays the scope 3 form", (n) => {
    expect(MANUAL_INPUT_HIERARCHY[`III.${n}.2`].scope).toBe(3);
  });

  it("has a reference table row for all five references", () => {
    const scopes = Object.fromEntries(
      GPC_REFERENCE_TABLE.map((row) => [row.gpcRefNo, row.scope]),
    );
    expect(scopes).toMatchObject({
      "III.1.3": 1,
      "III.2.3": 1,
      "III.3.3": 1,
      "III.4.3": 1,
      "VI.1": 3,
    });
  });
});
