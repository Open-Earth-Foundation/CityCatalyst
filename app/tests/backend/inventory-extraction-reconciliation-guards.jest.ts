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
    });
  });
});
