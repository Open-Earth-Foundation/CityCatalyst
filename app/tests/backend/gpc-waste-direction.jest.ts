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
const { resolveGpcRefFromLabels } =
  await import("@/util/GHGI/gpc-ref-resolver");
const { isBreakdownEmpty } = await import("@/util/GHGI/reported-totals");
const { MANUAL_INPUT_HIERARCHY } = await import("@/util/form-schema");
const { default: GPC_REFERENCE_TABLE } =
  await import("@/util/GHGI/data/gpc-reference-table.json");

// Review round 4: labels that looked like a .3 statement and were not.
const NOT_OUTSIDE_IN = [
  "Waste generated outside households and treated in the city",
  "Waste generated outside the city centre and treated in the city",
  "Waste generated outside residential areas and treated in the city",
  "Wastewater generated outside the sewer network and treated in the city",
  "Waste generated outside and inside the city and treated in the city",
  "Waste generated outside or within the city and treated within the city",
  "Waste generated outside the city and waste generated in the city treated in the city",
  "Waste generated outside the city and never treated in the city",
  "Waste generated outside the city that cannot be treated in the city",
  "Waste generated outside the city that isn't treated in the city",
  "Waste generated outside the city rather than treated in the city",
  "Waste generated outside the city minus that treated in the city",
  "Waste generated outside the city w/o waste treated in the city",
  "Waste generated outside the city unless treated in the city",
  "Waste generated outside the city\nand not treated in the city",
  "Waste generated outside the city\nexcluding waste treated in the city",
  "Waste generated outside the city\r\nwithout waste treated in the city",
];

const OUTSIDE_IN = [
  "Waste generated outside the city boundary and disposed in landfills within the city boundary",
  "Wastewater generated outside the city but treated within the city",
  "Imported waste",
];
const INSIDE_OUT = [
  "Emissions from solid waste generated within the city boundary but disposed in landfills or open dumps outside the city boundary",
  "Solid waste generated within the city boundary but disposed in landfills outside the city boundary",
  "Wastewater generated in the city and treated outside",
  "Exported waste",
];

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

  it.each([...OUTSIDE_IN, ...NOT_OUTSIDE_IN])(
    "never resolves a label to III.x.3: %s",
    (label) => {
      for (const [scopeLabel, ref] of [
        ["1", "III.1.1"],
        ["3", "III.1.2"],
        [undefined, "III.1.1"],
      ]) {
        expect(
          resolveGpcRefFromLabels({
            ...solidWaste,
            scopeLabel,
            fuelTypeOrActivity: label,
          }),
        ).toBe(ref);
      }
    },
  );

  it("resolves Other Scope 3 labels", () => {
    expect(
      resolveGpcRefFromLabels({
        sector: "Other Scope 3",
        subsector: "Other Scope 3",
      }),
    ).toBe("VI.1");
  });

  it.each([
    ["III.1.3", INSIDE_OUT[0], undefined],
    ["III.1.3", NOT_OUTSIDE_IN[0], "3"],
    ["III.1.2", OUTSIDE_IN[0], "1"],
    ["III.1.1", OUTSIDE_IN[2], "3"],
  ])(
    "keeps %s whatever the label and scope say",
    async (ref, category, scope) => {
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
          gpcRefNo: ref,
          category,
          scope,
          totalCO2e: 5,
        },
      ]);
      expect(result.rows[0].gpcRefNo).toBe(ref);
      jest.restoreAllMocks();
    },
  );
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
  it("shows III.x.3, VI.1 and I.4.4 as not counted, and no other row", async () => {
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
          { ...base, gpcRefNo: "I.4.4", rowIndex: 3 },
        ],
        errors: [],
        warnings: [],
        rowCount: 4,
        validRowCount: 4,
      } as never,
      undefined,
    );
    expect(preview.skippedRows).toBe(0);
    expect(
      preview.rows.map((row) => [row.gpcRefNo, row.status, row.issue]),
    ).toEqual([
      ["III.4.3", "not-counted", "omitted-from-total"],
      ["VI.1", "not-counted", "reported-apart-from-total"],
      ["I.4.4", "not-counted", "reported-apart-from-total"],
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
