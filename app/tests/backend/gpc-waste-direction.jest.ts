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

  it.each([
    [
      "III.1.2",
      "Waste generated in the city, shipped outside the city and disposed in a regional landfill",
    ],
    [
      "III.1.2",
      "Waste generated in the city, exported outside the city and treated in a regional plant",
    ],
    [
      "III.3.2",
      "Waste produced in the municipality and sent outside city limits, incinerated in neighbouring plant",
    ],
  ])("keeps real %s rows: %s", (ref, label) => {
    expect(correctWasteDirection(ref, [label])).toBe(ref);
  });

  it.each([
    [
      "III.1.2",
      "Waste generated in the city and sent to a regional landfill, excluding imported waste",
    ],
    [
      "III.1.2",
      "Waste generated in the city; waste generated outside the city and treated in the city is excluded",
    ],
    ["III.1.2", "Non-imported waste landfilled outside the city"],
    ["III.1.1", "Solid waste disposal (excl. imported waste)"],
    [
      "III.1.1",
      "Landfill, excluding waste generated outside the city and treated within the city",
    ],
    [
      "III.3.2",
      "Municipal waste incinerated elsewhere, imported waste not included",
    ],
    ["III.1.1", "Landfill except imported waste"],
    ["III.1.1", "Landfill without imported waste"],
    ["III.1.1", "Landfill not including imported waste"],
    ["III.1.1", "No imported waste"],
    ["III.1.2", "Waste other than imported waste"],
    [
      "III.1.2",
      "Waste generated outside the city and treated within the city is excluded",
    ],
    [
      "III.1.2",
      "Waste generated outside the city and not treated within the city",
    ],
    [
      "III.1.2",
      "Waste generated outside the city and treated within the city, not included",
    ],
    [
      "III.1.2",
      "Except waste generated outside the city and treated in the city",
    ],
    [
      "III.1.2",
      "Waste generated outside the city except that treated within the city",
    ],
  ])("keeps %s on exclusion wording: %s", (ref, label) => {
    expect(correctWasteDirection(ref, [label])).toBe(ref);
    expect(correctWasteDirection(ref, [label], "3")).toBe(ref);
  });

  it.each([
    "Waste generated in neighbouring cities and disposed in the city landfill located outside the urban area",
    "Waste generated in other municipalities, treated at the plant just outside town",
    "Excluding waste generated in the city and treated outside",
  ])("keeps a real III.x.3 row: %s", (label) => {
    expect(correctWasteDirection("III.1.3", [label])).toBe("III.1.3");
  });

  it("keeps every catalogue name on its own reference", () => {
    const wasteRows = GPC_REFERENCE_TABLE.filter((row) =>
      row.gpcRefNo.startsWith("III."),
    );
    expect(wasteRows).toHaveLength(12);
    for (const { gpcRefNo, subcategoryName } of wasteRows) {
      const name = subcategoryName!.replaceAll("-", " ");
      expect(correctWasteDirection(gpcRefNo, [name])).toBe(gpcRefNo);
    }
  });

  it("does not mix the sub-sector name with a row label", () => {
    expect(
      correctWasteDirection("III.1.2", [
        "Disposal of solid waste generated in the city",
        OUTSIDE_IN[0],
      ]),
    ).toBe("III.1.3");
    expect(
      correctWasteDirection("III.1.3", [
        "Disposal of solid waste generated in the city",
        "Landfill outside",
      ]),
    ).toBe("III.1.3");
  });

  it("does not read treatment outside as treatment inside", () => {
    expect(
      correctWasteDirection("III.1.2", [
        "Waste generated outside the city and treated outside",
      ]),
    ).toBe("III.1.2");
  });

  it("maps III.x.3 on an explicit scope 3 row to III.x.2", () => {
    expect(correctWasteDirection("III.1.3", [], "3")).toBe("III.1.2");
    expect(correctWasteDirection("III.1.3", [], "Scope 3")).toBe("III.1.2");
    expect(correctWasteDirection("III.1.3", [], "1")).toBe("III.1.3");
    expect(correctWasteDirection("III.1.3", [], null)).toBe("III.1.3");
  });

  it("lets a stated direction win over the scope", () => {
    expect(correctWasteDirection("III.1.3", [OUTSIDE_IN[0]], "3")).toBe(
      "III.1.3",
    );
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

  it.each(["1", "3"])(
    "ignores excluded imported waste on scope %s",
    (scopeLabel) => {
      expect(
        resolveGpcRefFromLabels({
          ...solidWaste,
          scopeLabel,
          fuelTypeOrActivity: "Landfilled waste excluding imported waste",
        }),
      ).toBe(scopeLabel === "1" ? "III.1.1" : "III.1.2");
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
