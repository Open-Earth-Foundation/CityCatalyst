/**
 * CC-1163: guards around total reconciliation. The LLM is mocked; these tests
 * prove the code around the model.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const complete = jest.fn<(args: unknown) => Promise<{ content: string }>>();

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete }),
  LLMError: class LLMError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));

const {
  extractInventoryFromDocument,
  finalizeExtractedRows,
  selectReconciledPages,
} = await import("@/backend/InventoryExtractionService");
const { extractionReviewNotes, reconcileExtraction, reconciliationTargets } =
  await import("@/util/GHGI/extraction-summary");
type ExtractedRow = Parameters<typeof finalizeExtractedRows>[0][number];
type ReportedTotal = Parameters<typeof reconciliationTargets>[0] extends
  (infer T)[] | null | undefined
  ? T
  : never;

beforeEach(() => {
  complete.mockReset();
});

/** The model answers every call with these rows (numbers as strings). */
function mockRows(rows: Record<string, unknown>[]) {
  complete.mockImplementation(async () => ({
    content: JSON.stringify({ rows }),
  }));
}

/** A line item and a printed grand total, both as the string `value`. */
const stringRows = (value: string) => [
  {
    year: 2021,
    sector: "Stationary Energy",
    subsector: "Residential Buildings",
    scope: "1",
    gpcRefNo: "I.1.1",
    totalCO2e: value,
    rowType: "line_item",
  },
  {
    year: 2021,
    sector: null,
    subsector: null,
    category: "BASIC+",
    totalCO2e: value,
    rowType: "total",
  },
];

describe("CC-1163 number strings", () => {
  it("european page: a string 1.500 imports 1500", async () => {
    mockRows(stringRows("1.500"));
    const text =
      "<!-- page: 1 -->\nGPC table\n" +
      "1.234.567 2.345.678 3.456.789 4.567.890 5.678.901 6.789.012 " +
      "7.890.123 8.901.234\nTotal 1.500\n";
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows[0].totalCO2e).toBe(1500);
  });

  it("english page: a string 1,5 imports 1.5", async () => {
    mockRows(stringRows("1,5"));
    const text =
      "<!-- page: 1 -->\nGPC table\n" +
      "1,234,567 2,345,678 3,456,789 4,567,890 5,678,901 6,789,012 " +
      "7,890,123 8,901,234\nTotal 1,5\n";
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows[0].totalCO2e).toBe(1.5);
  });

  it("scientific notation strings keep their exponent", async () => {
    mockRows([
      { ...stringRows("9e2")[0], totalCO2e: "9e2" },
      {
        ...stringRows("6e2")[0],
        subsector: "Commercial Buildings",
        gpcRefNo: "I.2.1",
        totalCO2e: "6e2",
      },
      { ...stringRows("15e2")[1], totalCO2e: "15e2" },
    ]);
    const text =
      "<!-- page: 1 -->\nGPC table\nResidential 900\nCommercial 600\n" +
      "Total 1,500\n";
    const { rows, summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows.map((r) => r.totalCO2e)).toEqual([900, 600]);
    expect(summary.reportedTotals?.[0]?.value).toBe(1500);
  });
});

/** Two line items that add up to 5,000,000 and a total row of `total`. */
const fiveMillionRows = (total = 5000000): ExtractedRow[] =>
  [
    {
      year: 2021,
      sector: "Stationary Energy",
      subsector: "Residential Buildings",
      scope: "1",
      gpcRefNo: "I.1.1",
      totalCO2e: 3000000,
      rowType: "line_item",
    },
    {
      year: 2021,
      sector: "Transportation",
      subsector: "On-Road",
      scope: "1",
      gpcRefNo: "II.1.1",
      totalCO2e: 2000000,
      rowType: "line_item",
    },
    {
      year: 2021,
      sector: null,
      subsector: null,
      category: "Total",
      totalCO2e: total,
      rowType: "total",
    },
  ] as ExtractedRow[];

const totalRow = (category: string, totalCO2e: number) =>
  ({
    year: 2021,
    sector: null,
    subsector: null,
    category,
    totalCO2e,
    rowType: "total",
  }) as ExtractedRow;

describe("CC-1163 check 1: total in text", () => {
  const lineItemsText =
    "GPC table\nResidential buildings 3,000,000\nOn-road 2,000,000\n";

  it("invented total is not a target", () => {
    const result = finalizeExtractedRows(fiveMillionRows(), 2021, {
      source: { text: lineItemsText, kind: "page" },
    });
    expect(result.summary.reportedTotals[0].inText).toBe(false);
    expect(
      reconciliationTargets(result.summary.reportedTotals, 2021).grand,
    ).toEqual([]);

    const selected = selectReconciledPages([{ page: 1, result }], 2021);
    expect(selected.summary.pageSelection).toBe("fallback");
    expect(extractionReviewNotes(selected.summary).reconciliation).toBeNull();
  });

  it("printed total is a target", () => {
    const result = finalizeExtractedRows(fiveMillionRows(), 2021, {
      source: { text: lineItemsText + "TOTAL 5,000,000\n", kind: "page" },
    });
    expect(result.summary.reportedTotals[0].inText).toBe(true);
    const selected = selectReconciledPages([{ page: 1, result }], 2021);
    expect(selected.summary.pageSelection).toBe("reconciled");
  });

  it("net total keeps its sign", () => {
    const text =
      "AFOLU \u2212603,983\nTotal net emissions 9,559,215\n" +
      "Total net emissions (including forestry) (25,639)\n";
    const { summary } = finalizeExtractedRows(
      [
        totalRow("Total net emissions", 9559215),
        totalRow("Total net emissions (including forestry)", -25639),
      ],
      2021,
      { source: { text, kind: "page" } },
    );
    const [positive, negative] = summary.reportedTotals;
    expect(positive).toMatchObject({ value: 9559215, inText: true });
    expect(negative).toMatchObject({ value: -25639, inText: true });
    const targets = reconciliationTargets(summary.reportedTotals, 2021);
    expect([...targets.grand, ...targets.net]).toContain(9559215);
    expect(targets.net).toContain(-25639);
  });

  it("unfound grand total does not trigger the page retry", async () => {
    // The rows miss the invented total by 17%: a printed total would ask the page
    // once more. Unfound, the page is asked once, then the chunk fallback runs.
    mockRows([...fiveMillionRows(6000000)] as Record<string, unknown>[]);
    const text =
      "<!-- page: 1 -->\nGPC table\n" +
      "Residential buildings 3,000,000\nOn-road 2,000,000\n" +
      "101,101 102,102 103,103 104,104 105,105 106,106 107,107 108,108\n" +
      "<!-- page: 2 -->\nNotes only.\n";
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 6000000,
      inText: false,
    });
    // One page call (page 2 has no numbers) and one whole-document call; no retry.
    expect(complete).toHaveBeenCalledTimes(2);
  });

  // Review Focus 1
  it("rounded total in words gives no verdict", () => {
    const { summary } = finalizeExtractedRows(
      [totalRow("Total", 9559215)],
      2021,
      { source: { text: "Emissions were about 9.56 million", kind: "page" } },
    );
    expect(summary.reportedTotals[0].inText).toBe(false);
    expect(reconcileExtraction(summary)).toBeNull();
  });

  // Review Focus 5: the summary of the Auckland test "flags the inflated Auckland
  // import", stored before this change (no inText).
  it("stored summary without inText", () => {
    const stored = {
      importedSum: 32981169,
      reportedTotals: [
        {
          label: "BASIC+",
          value: 9559215,
          year: 2021,
          scope: null,
          sector: null,
          subsector: null,
          level: "total",
        },
      ] as ReportedTotal[],
    };
    const reconciliation = reconcileExtraction(stored);
    expect(reconciliation).toEqual({
      importedSum: stored.importedSum,
      reportedTotal: stored.reportedTotals[0].value,
      deviation:
        Math.abs(stored.importedSum - stored.reportedTotals[0].value) /
        Math.abs(stored.reportedTotals[0].value),
      mismatch: true,
      source: "document",
    });
  });
});

describe("CC-1163 check 2: year evidence", () => {
  const body =
    "Residential buildings 3,000,000\nOn-road 2,000,000\nTOTAL 5,000,000\n";
  const page = (caption: string) => `${caption}\n${body}`;

  it("keeps the rows of a table continued above another year's caption", () => {
    // Rosario 2022 p. 55: the end of the 2022 table, then the 2021 table.
    const rows: ExtractedRow[] = [
      {
        year: 2022,
        sector: "AFOLU",
        subsector: "Livestock",
        scope: "1",
        gpcRefNo: "V.1",
        totalCO2e: 49.71,
        rowType: "line_item",
      },
      {
        year: 2022,
        sector: "Stationary Energy",
        subsector: "Residential Buildings",
        scope: "1",
        gpcRefNo: "I.1.1",
        totalCO2e: 364749.37,
        rowType: "line_item",
      },
    ] as ExtractedRow[];
    const result = finalizeExtractedRows(rows, 2022, {
      deferYearAssumption: true,
      currentYear: 2026,
      source: {
        text:
          "| V.1 | Ganaderia | 49,71 |\n" +
          "## Tabla de Resultados Inventario 2021\n" +
          "| I.1.1 | Residencial | 364.749,37 |\n",
        kind: "page",
      },
    });
    expect(result.rows.map((r) => r.gpcRefNo)).toEqual(["V.1"]);
    expect(result.summary.droppedRows.caption_year).toBe(1);
    expect(result.summary.droppedRows.other_year).toBeUndefined();
  });

  it("rows of a 2019 table labeled 2021 are dropped", () => {
    const rows = fiveMillionRows();
    const result = finalizeExtractedRows(rows, 2021, {
      deferYearAssumption: true,
      currentYear: 2026,
      source: {
        text: page("Table A-3 GHG emissions for 2019"),
        kind: "page",
      },
    });
    expect(result.rows).toEqual([]);
    expect(result.summary.droppedRows.caption_year).toBe(2);
    expect(result.summary.droppedRows.other_year).toBeUndefined();
    expect(result.summary.reportedTotals[0].year).toBe(2019);
    expect(
      reconciliationTargets(result.summary.reportedTotals, 2021).grand,
    ).toEqual([]);
  });

  it("selection takes the 2021 page", () => {
    const opts = (caption: string) => ({
      deferYearAssumption: true,
      currentYear: 2026,
      source: { text: page(caption), kind: "page" as const },
    });
    const p2019 = finalizeExtractedRows(
      fiveMillionRows(),
      2021,
      opts("Table A-3 GHG emissions for 2019"),
    );
    const p2021 = finalizeExtractedRows(
      fiveMillionRows(),
      2021,
      opts("Table A-4 GHG emissions for 2021"),
    );
    const selected = selectReconciledPages(
      [
        { page: 1, result: p2019 },
        { page: 2, result: p2021 },
      ],
      2021,
    );
    expect(selected.summary.pageSelection).toBe("reconciled");
    expect(selected.summary.selectedPages).toEqual([2]);
  });

  it("continuation page without caption year joins the run", () => {
    const [residential, onRoad, total] = fiveMillionRows();
    const first = finalizeExtractedRows([residential, total], 2021, {
      deferYearAssumption: true,
      currentYear: 2026,
      source: {
        text: "Table A-1 GHG emissions for 2021\nResidential buildings 3,000,000\nTOTAL 5,000,000\n",
        kind: "page",
      },
    });
    const second = finalizeExtractedRows([onRoad], 2021, {
      deferYearAssumption: true,
      currentYear: 2026,
      source: { text: "On-road 2,000,000\n", kind: "page" },
    });
    expect(second.rows).toHaveLength(1);
    const selected = selectReconciledPages(
      [
        { page: 1, result: first },
        { page: 2, result: second },
      ],
      2021,
    );
    expect(selected.summary.selectedPages).toEqual([1, 2]);
  });
});

describe("CC-1163 check 3: missing unit", () => {
  const noUnitRows = () =>
    fiveMillionRows().map((r) => ({ ...r, unit: null })) as ExtractedRow[];
  const body =
    "Residential buildings 3,000,000\nOn-road 2,000,000\nTOTAL 5,000,000\n";

  it("drops unitless rows on a kt page", () => {
    const rows = noUnitRows();
    const result = finalizeExtractedRows(rows, 2021, {
      source: { text: "Table 2 Emissions (kt CO2e)\n" + body, kind: "page" },
    });
    expect(result.rows).toHaveLength(0);
    expect(result.summary.droppedRows.unsupported_unit).toBe(rows.length);
    expect(result.summary.reportedTotals).toHaveLength(0);
    expect(extractionReviewNotes(result.summary).droppedReasons).toContain(
      "unsupported_unit",
    );
  });

  it("keeps a notation-only row (NE) on a kt page", () => {
    const [residential] = noUnitRows();
    const notationRow: ExtractedRow = {
      ...residential,
      totalCO2e: null,
      notationKey: "NE",
    };
    const result = finalizeExtractedRows([notationRow], 2021, {
      source: { text: "Table 2 Emissions (kt CO2e)\n" + body, kind: "page" },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].notationKey).toBe("NE");
    expect(result.summary.droppedRows.unsupported_unit).toBeUndefined();
  });

  it("keeps unitless rows on a tonnes page", () => {
    const result = finalizeExtractedRows(noUnitRows(), 2021, {
      source: { text: "Table 2 Emissions (t CO2e)\n" + body, kind: "page" },
    });
    expect(result.rows.map((r) => r.totalCO2e)).toEqual([3000000, 2000000]);
    expect(result.summary.droppedRows.unsupported_unit).toBeUndefined();
  });

  it("keeps unitless rows on a document source", () => {
    const result = finalizeExtractedRows(noUnitRows(), 2021, {
      source: {
        text: "Table 2 Emissions (kt CO2e)\n" + body,
        kind: "document",
      },
    });
    expect(result.rows.map((r) => r.totalCO2e)).toEqual([3000000, 2000000]);
    expect(result.summary.droppedRows.unsupported_unit).toBeUndefined();
  });
});

describe("CC-1163 page evidence survives the chunk fallback", () => {
  /** A kt-sized table: 6,000.2 + 3,559.0 = 9,559.2, model gives no unit. */
  const ktRows = (unit: string | null) => [
    {
      year: 2021,
      sector: "Stationary Energy",
      subsector: "Residential Buildings",
      scope: "1",
      gpcRefNo: "I.1.1",
      totalCO2e: 6000.2,
      unit,
      rowType: "line_item",
    },
    {
      year: 2021,
      sector: "Transportation",
      subsector: "On-Road",
      scope: "1",
      gpcRefNo: "II.1.1",
      totalCO2e: 3559,
      unit,
      rowType: "line_item",
    },
    {
      year: 2021,
      sector: null,
      subsector: null,
      category: "Total",
      totalCO2e: 9559.2,
      unit,
      rowType: "total",
    },
  ];
  const tail =
    "| Residential | 6,000.2 |\n| On-road | 3,559.0 |\n| Total | 9,559.2 |\n" +
    "101,101 102,102 103,103 104,104 105,105 106,106\n" +
    "<!-- page: 2 -->\nNotes only.\n";

  it.each(["kt CO2e", "ktCO₂e"])(
    "kt page (%s) with unitless rows: nothing imported as tonnes",
    async (unit) => {
      mockRows(ktRows(null));
      const text =
        `<!-- page: 1 -->\n## Table 2 GHG emissions 2021 (${unit})\n` +
        "| Sector | Emissions |\n| --- | --- |\n" +
        tail;
      const { rows, summary } = await extractInventoryFromDocument(text, {
        targetYear: 2021,
      });
      expect(rows).toEqual([]);
      expect(summary.droppedRows.unsupported_unit).toBeGreaterThan(0);
      expect(extractionReviewNotes(summary).droppedReasons).toContain(
        "unsupported_unit",
      );
      const reconciliation = reconcileExtraction(summary);
      expect(reconciliation == null || reconciliation.mismatch).toBe(true);
      // The page call only: no whole-document re-extraction.
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it("2019 table labeled 2021: no 2021 rows imported", async () => {
    mockRows(ktRows("t"));
    const text =
      "<!-- page: 1 -->\nTable A-3 GHG emissions for 2019 (t CO2e)\n" +
      "| Sector | Emissions |\n| --- | --- |\n" +
      tail;
    await expect(
      extractInventoryFromDocument(text, { targetYear: 2021 }),
    ).rejects.toThrow("Inventory not found for the target year");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("pages without evidence drops still fall back to chunks", async () => {
    // Line items miss the printed total by far: no run reconciles.
    const rows = ktRows("t");
    rows[2].totalCO2e = 19559.2;
    mockRows(rows);
    const text =
      "<!-- page: 1 -->\nTable 2 GHG emissions 2021 (t CO2e)\n" +
      "| Sector | Emissions |\n| --- | --- |\n" +
      "| Residential | 6,000.2 |\n| On-road | 3,559.0 |\n| Total | 19,559.2 |\n" +
      "101,101 102,102 103,103 104,104 105,105 106,106\n" +
      "<!-- page: 2 -->\nNotes only.\n";
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
    // One page call (page 2 has no numbers) and the whole-document call.
    expect(complete.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("CC-1163 number style on the chunk path", () => {
  it("document without page markers: a string 1.500 imports 1500", async () => {
    mockRows(stringRows("1.500"));
    const text =
      "GPC table\n" +
      "1.234.567 2.345.678 3.456.789 4.567.890 5.678.901 6.789.012 " +
      "7.890.123 8.901.234\nTotal 1.500\n";
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows[0].totalCO2e).toBe(1500);
  });
});
