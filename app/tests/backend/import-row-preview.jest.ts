import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { db } from "@/models";
import ECRFImportService, {
  countRowsSkippedEmptyEmissions,
  type ECRFImportResult,
  type ECRFRowData,
} from "@/backend/ECRFImportService";
import { importRowSkipReason } from "@/backend/InventoryImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import {
  findPendingRows,
  previewImportRows,
} from "@/backend/ImportRowPreviewService";
import { applyReviewedRows } from "@/backend/ImportResultBuilder";
import type { Sector } from "@/models/Sector";
import { InventoryTypeEnum } from "@/util/enums";

const STRUCTURE = [
  {
    sectorId: "sector-I",
    referenceNumber: "I",
    subSectors: [
      {
        referenceNumber: "I.1",
        subCategories: [
          { referenceNumber: "I.1.1", scope: { scopeName: "1" } },
          { referenceNumber: "I.1.2", scope: { scopeName: "2" } },
          { referenceNumber: "I.1.3", scope: { scopeName: "3" } },
        ],
      },
    ],
  },
] as unknown as Sector[];

function row(rowIndex: number, fields: Partial<ECRFRowData> = {}): ECRFRowData {
  return {
    gpcRefNo: "I.1.1",
    sectorId: "sector-I",
    subsectorId: "subsector-I.1",
    subcategoryId: "subcategory-I.1.1",
    scopeId: "scope-1",
    rowIndex,
    sourceRowNumber: rowIndex + 2,
    ...fields,
  };
}

function importResult(rows: ECRFRowData[]): ECRFImportResult {
  return {
    rows,
    errors: [],
    warnings: [],
    rowCount: rows.length,
    validRowCount: rows.filter((r) => !r.errors?.length).length,
    rowsSkippedEmptyEmissions: countRowsSkippedEmptyEmissions(rows),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("importRowSkipReason", () => {
  it("imports rows with emissions, even when a notation key is also present", () => {
    expect(importRowSkipReason(row(0, { totalCO2e: 12 }))).toBeNull();
    expect(importRowSkipReason(row(0, { co2: 3, ch4: 1 }))).toBeNull();
    expect(importRowSkipReason(row(0, { totalCO2e: -4 }))).toBeNull();
    expect(
      importRowSkipReason(row(0, { totalCO2e: 5, notationKey: "XX" })),
    ).toBeNull();
  });

  it("imports rows with a known notation key", () => {
    expect(importRowSkipReason(row(0, { notationKey: "IE" }))).toBeNull();
    expect(importRowSkipReason(row(0, { notationKey: "no" }))).toBeNull();
    expect(
      importRowSkipReason(row(0, { notationKey: "Not Occuring" })),
    ).toBeNull();
    expect(
      importRowSkipReason(row(0, { notationKey: "Not Estimated" })),
    ).toBeNull();
  });

  it("skips rows with an unknown notation key or no data at all", () => {
    expect(importRowSkipReason(row(0, { notationKey: "XX" }))).toBe(
      "unknown-notation-key",
    );
    expect(importRowSkipReason(row(0, { totalCO2e: 0 }))).toBe(
      "no-value-or-notation-key",
    );
    expect(importRowSkipReason(row(0))).toBe("no-value-or-notation-key");
  });
});

describe("previewImportRows", () => {
  it("explains every skipped and not-counted row in file order", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([
        row(0, { totalCO2e: 10 }),
        row(1, { gpcRefNo: "I.1.3", totalCO2e: 2 }),
        row(2, {
          gpcRefNo: "",
          issue: "missing-gpc-reference",
          errors: ["No GPC reference number found"],
        }),
        row(3, {
          gpcRefNo: "",
          sourceLabel: "Energy / Mystery",
          issue: "gpc-reference-unresolved",
          errors: ["Could not resolve"],
        }),
        row(4, {
          gpcRefNo: "I.9.9",
          issue: "gpc-reference-unknown",
          errors: ["not found"],
        }),
        row(5, { notationKey: "XX" }),
        row(6),
        row(7, { errors: ["legacy error without a code"] }),
      ]),
      InventoryTypeEnum.GPC_BASIC,
    );

    expect(preview).toMatchObject({
      totalRows: 8,
      importedRows: 2,
      skippedRows: 6,
      skippedByIssue: {
        "missing-gpc-reference": 1,
        "gpc-reference-unresolved": 1,
        "gpc-reference-unknown": 1,
        "unknown-notation-key": 1,
        "no-value-or-notation-key": 1,
        "invalid-row": 1,
      },
    });
    expect(
      preview.rows.map(({ rowNumber, gpcRefNo, status, issue }) => [
        rowNumber,
        gpcRefNo,
        status,
        issue,
      ]),
    ).toEqual([
      [3, "I.1.3", "not-counted", "outside-inventory-type"],
      [4, null, "skipped", "missing-gpc-reference"],
      [5, null, "skipped", "gpc-reference-unresolved"],
      [6, "I.9.9", "skipped", "gpc-reference-unknown"],
      [7, "I.1.1", "skipped", "unknown-notation-key"],
      [8, "I.1.1", "skipped", "no-value-or-notation-key"],
      [9, "I.1.1", "skipped", "invalid-row"],
    ]);
    expect(preview.rows[2].sourceLabel).toBe("Energy / Mystery");
    expect(preview.rows[4].notationKey).toBe("XX");
  });

  it("counts every imported row for GPC BASIC+", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([row(0, { gpcRefNo: "I.1.3", totalCO2e: 2 })]),
      InventoryTypeEnum.GPC_BASIC_PLUS,
    );

    expect(preview).toMatchObject({ importedRows: 1, rows: [] });
  });

  it("falls back to the extracted row position when there is no file row number", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([row(4, { sourceRowNumber: undefined })]),
      InventoryTypeEnum.GPC_BASIC,
    );

    expect(preview.rows[0].rowNumber).toBe(5);
  });
});

describe("ECRFImportService.processECRFFile", () => {
  beforeEach(() => {
    jest
      .spyOn(db.models.Scope, "findAll")
      .mockResolvedValue([{ scopeId: "scope-1", scopeName: "1" }] as never);
  });
  it("reads activity_name as fuel and ignores gas columns as emission factors", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const headers = [
      "gpc_ref_no",
      "sector",
      "subsector",
      "activity_name",
      "activity_amount",
      "scope",
      "co2",
      "ch4",
      "n2o",
      "total_co2e",
      "year",
    ];
    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Sheet1",
          headers,
          rows: [
            {
              gpc_ref_no: "I.1.1",
              sector: "Stationary Energy",
              subsector: "Residential",
              activity_name: "Gas natural",
              activity_amount: 10,
              scope: "1",
              co2: 6139026,
              ch4: 1,
              n2o: 2,
              total_co2e: 100,
              year: 2020,
            },
            {
              gpc_ref_no: "I.1.2",
              sector: "Stationary Energy",
              subsector: "Residential",
              activity_name: "Not Occuring",
              activity_amount: null,
              scope: "1",
              co2: null,
              ch4: null,
              n2o: null,
              total_co2e: null,
              year: 2020,
            },
          ],
          rowCount: 3,
          columnCount: headers.length,
        },
      },
      {
        gpcRefNo: 0,
        sector: 1,
        subsector: 2,
        activityType: 3,
        activityAmount: 4,
        scope: 5,
        co2: 6,
        ch4: 7,
        n2o: 8,
        totalCO2e: 9,
        year: 10,
        // Simulate the pre-fix bad binding so the importer still rejects it
        emissionFactorCO2: 6,
        emissionFactorCH4: 7,
        emissionFactorN2O: 8,
        emissionFactorTotalCO2e: 6,
      },
    );

    expect(result.rows[0]).toMatchObject({
      activityType: "Gas natural",
      co2: 6139026,
      emissionFactorCO2: undefined,
      emissionFactorCH4: undefined,
      emissionFactorN2O: undefined,
      emissionFactorTotalCO2e: undefined,
      notationKey: undefined,
    });
    expect(result.rows[1]).toMatchObject({
      activityType: undefined,
      notationKey: "Not Occuring",
    });
    expect(importRowSkipReason(result.rows[1])).toBeNull();
  });

  it("keeps rows without a GPC reference as rejected rows with their file row number", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Inventory",
          headers: ["GPC ref. no.", "Total CO2e"],
          rows: [
            { "GPC ref. no.": "I.1.1", "Total CO2e": 10 },
            { "GPC ref. no.": null, "Total CO2e": 99 },
          ],
          rowNumbers: [2, 4],
          rowCount: 4,
          columnCount: 2,
        },
      },
      { gpcRefNo: 0, totalCO2e: 1 },
    );

    expect(result.validRowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      gpcRefNo: "I.1.1",
      sourceRowNumber: 2,
    });
    expect(result.rows[1]).toMatchObject({
      gpcRefNo: "",
      sourceRowNumber: 4,
      issue: "missing-gpc-reference",
    });
  });

  it("counts fully blank sheet rows as skipped empty rows, not missing GPC", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Inventory",
          headers: ["GPC ref. no.", "Total CO2e"],
          rows: [
            { "GPC ref. no.": "I.1.1", "Total CO2e": 10 },
            { "GPC ref. no.": null, "Total CO2e": null },
            { "GPC ref. no.": "I.1.2", "Total CO2e": 4 },
          ],
          rowNumbers: [2, 3, 4],
          rowCount: 4,
          columnCount: 2,
        },
      },
      { gpcRefNo: 0, totalCO2e: 1 },
    );

    expect(result.rowCount).toBe(3);
    expect(result.rows[1]).toMatchObject({
      sourceRowNumber: 3,
      issue: "no-value-or-notation-key",
    });
  });
});

describe("excluded reference needs a decision (Net 1)", () => {
  function reviewed(
    ref: string,
    review: Record<string, unknown>,
    fields: Partial<ECRFRowData> = {},
  ): ECRFRowData {
    return row(0, {
      gpcRefNo: ref,
      totalCO2e: 1710,
      review: {
        sector: "Stationary Energy",
        subsector: "Energy generation",
        category: null,
        scope: null,
        refSource: "inferred",
        directionEvidence: null,
        directionEvidenceFound: null,
        page: 1,
        source: null,
        decision: null,
        suggestedRefNo: ref,
        ...review,
      } as ECRFRowData["review"],
      ...fields,
    });
  }

  function reviewResult(rows: ECRFRowData[]): ECRFImportResult {
    return { ...importResult(rows), requiresReferenceReview: true };
  }

  beforeEach(() => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);
  });

  async function preview(rows: ECRFRowData[]) {
    return previewImportRows(
      reviewResult(rows),
      InventoryTypeEnum.GPC_BASIC_PLUS,
    );
  }

  it.each([
    ["no activity class", { activityClass: null }],
    ["activity class other", { activityClass: "other" }],
    [
      "grid supply labelled as losses",
      { activityClass: "grid_supply", category: "Electricity T&D Losses" },
    ],
    [
      "grid supply labelled as losses in Portuguese",
      { activityClass: "grid_supply", category: "Perdas de distribuição" },
    ],
  ])("holds a valued I.4.4 row with %s", async (_name, review) => {
    const result = await preview([reviewed("I.4.4", review)]);
    expect(result.pendingRows).toBe(1);
    expect(result.reviewRows[0].issue).toBe("excluded-reference-unconfirmed");
    expect(result.rows[0]).toMatchObject({
      status: "pending",
      issue: "excluded-reference-unconfirmed",
    });
    expect(result.reviewRows[0].referenceOptions).toEqual(
      expect.arrayContaining(["I.4.3", "I.6.2", "I.6.3"]),
    );
  });

  it("does not hold genuine grid supply", async () => {
    const result = await preview([
      reviewed("I.4.4", {
        activityClass: "grid_supply",
        category: "Electricity supplied to grid",
      }),
    ]);
    expect(result.pendingRows).toBe(0);
    expect(result.rows[0]).toMatchObject({
      status: "not-counted",
      issue: "reported-apart-from-total",
    });
  });

  it("does not hold a reference the document printed", async () => {
    const result = await preview([
      reviewed("I.4.4", { activityClass: null, refSource: "document" }),
    ]);
    expect(result.pendingRows).toBe(0);
  });

  it("does not hold a legacy row without an activity class", async () => {
    const result = await preview([reviewed("I.4.4", {})]);
    expect(result.pendingRows).toBe(0);
  });

  it("does not hold a notation key row", async () => {
    const result = await preview([
      reviewed(
        "I.4.4",
        { activityClass: null },
        { totalCO2e: undefined, notationKey: "IE" },
      ),
    ]);
    expect(result.pendingRows).toBe(0);
  });

  it("does not flag a corrected row as a reference conflict", async () => {
    const result = await preview([
      reviewed("I.6.2", {
        activityClass: "td_losses",
        scope: "2",
        scopeSource: "inferred",
        originalScope: "1",
      }),
    ]);
    expect(result.reviewRows.map((r) => r.issue)).not.toContain(
      "reference-conflict",
    );
  });

  it("lists imported rows whose scope was inferred from the activity type", async () => {
    const result = await preview([
      {
        ...reviewed("I.1.2", { scope: "2", scopeSource: "inferred" }),
        rowIndex: 0,
      },
      {
        ...reviewed("I.1.2", {
          scope: "2",
          scopeSource: "inferred",
          originalScope: "1",
        }),
        rowIndex: 1,
        sourceRowNumber: 3,
      },
      {
        ...reviewed("I.1.1", { scope: "1", scopeSource: "document" }),
        rowIndex: 2,
        sourceRowNumber: 4,
      },
    ]);
    expect(result.inferredScopeRows).toHaveLength(2);
    expect(result.inferredScopeRows).toEqual([
      { rowNumber: 2, gpcRefNo: "I.1.2", scope: "2", originalScope: null },
      { rowNumber: 3, gpcRefNo: "I.1.2", scope: "2", originalScope: "1" },
    ]);
  });

  it("leaves an inferred row held for review out of inferredScopeRows", async () => {
    const result = await preview([
      reviewed("I.4.4", {
        activityClass: "other",
        scope: "2",
        scopeSource: "inferred",
      }),
    ]);
    expect(result.pendingRows).toBe(1);
    expect(result.inferredScopeRows).toEqual([]);
  });
});

describe("decisions on held rows (applyReviewedRows)", () => {
  const SCOPE_IDS: Record<string, string> = {
    "scope-1": "1",
    "scope-2": "2",
    "scope-3": "3",
  };
  const REF_SCOPE: Record<string, string> = {
    "I.4.4": "scope-1",
    "I.6.2": "scope-2",
    "I.6.3": "scope-3",
    "I.1.1": "scope-1",
  };

  function held(
    ref: string,
    review: Record<string, unknown>,
  ): ECRFImportResult {
    const rows = [
      row(0, {
        gpcRefNo: ref,
        totalCO2e: 1710,
        review: {
          sector: "Stationary Energy",
          subsector: "Energy generation",
          category: null,
          scope: "1",
          refSource: "inferred",
          directionEvidence: null,
          directionEvidenceFound: null,
          page: 1,
          source: null,
          decision: null,
          suggestedRefNo: ref,
          decisionToken: "tok",
          activityClass: null,
          ...review,
        } as ECRFRowData["review"],
      }),
    ];
    return { ...importResult(rows), requiresReferenceReview: true };
  }

  const decide = (extra: Record<string, unknown>) => ({
    "0": {
      decisionFileId: "file",
      decisionToken: "tok",
      decisionRef: "I.4.4",
      decisionScope: "1",
      decisionValue: 1710,
      ...extra,
    },
  });

  beforeEach(() => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockImplementation(
      async (ref: string) =>
        ({
          sectorId: "s",
          subsectorId: "ss",
          subcategoryId: `sub-${ref}`,
          scopeId: REF_SCOPE[ref],
        }) as never,
    );
    jest
      .spyOn(db.models.Scope, "findByPk")
      .mockImplementation(
        async (id: unknown) =>
          ({ scopeId: id, scopeName: SCOPE_IDS[String(id)] }) as never,
      );
    jest
      .spyOn(db.models.Scope, "findOne")
      .mockImplementation(async (opts: never) => {
        const name = (opts as { where: { scopeName: string } }).where.scopeName;
        const id = Object.keys(SCOPE_IDS).find((k) => SCOPE_IDS[k] === name);
        return { scopeId: id, scopeName: name } as never;
      });
  });

  it("is pending until decided", () => {
    expect(findPendingRows(held("I.4.4", {}))).toHaveLength(1);
  });

  it.each(["keep", "skip"])("clears a held row on %s", async (kind) => {
    const result = held("I.4.4", {});
    await applyReviewedRows(result, decide({ reviewDecision: kind }), "file");
    expect(findPendingRows(result)).toHaveLength(0);
  });

  it.each([
    ["I.6.3", "3"],
    ["I.6.2", "2"],
  ])("reclassifies to %s with the target scope", async (ref, scope) => {
    const result = held("I.4.4", {});
    await applyReviewedRows(
      result,
      decide({ reviewDecision: "reclassify", gpcRefNo: ref }),
      "file",
    );
    expect(findPendingRows(result)).toHaveLength(0);
    expect(result.rows[0].gpcRefNo).toBe(ref);
    expect(result.rows[0].review?.finalScope).toBe(scope);
    expect(result.rows[0].scopeId).toBe(`scope-${scope}`);
  });

  it("still rejects a reclassify on a reference-conflict row whose scope mismatches", async () => {
    // I.1.1 is scope 1; the document states scope 2, so this is a conflict.
    const result = held("I.1.1", { scope: "2", refSource: "document" });
    await applyReviewedRows(
      result,
      decide({
        decisionRef: "I.1.1",
        decisionScope: "2",
        reviewDecision: "reclassify",
        gpcRefNo: "I.6.3",
      }),
      "file",
    );
    expect(result.rows[0].gpcRefNo).toBe("I.1.1");
    expect(findPendingRows(result)).toHaveLength(1);
  });
});
