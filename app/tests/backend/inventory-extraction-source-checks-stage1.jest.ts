/**
 * CC-1163 stage 1: each line item is checked against its page text. Rows whose
 * value or unit is not confirmed are kept and marked for review, never trusted
 * silently or dropped.
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
const { inheritedPageScales } = await import("@/util/GHGI/source-text");
const { reconciliationTargets } =
  await import("@/util/GHGI/extraction-summary");

beforeEach(() => {
  complete.mockReset();
});
type ExtractedRow = Parameters<typeof finalizeExtractedRows>[0][number];

const lineItem = (
  totalCO2e: number | null,
  overrides: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: "Transportation",
  subsector: "On-Road",
  scope: "1",
  category: null,
  gpcRefNo: "II.1.1",
  totalCO2e,
  unit: "t",
  rowType: "line_item",
  ...overrides,
});

const total = (
  totalCO2e: number,
  overrides: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: null,
  subsector: null,
  category: "Total",
  totalCO2e,
  unit: "t",
  rowType: "total",
  ...overrides,
});

const page = (text: string) => ({
  source: { text, kind: "page" as const },
  currentYear: 2026,
});

describe("CC-1163 stage 1: line items checked against their page", () => {
  it("flags both rows when the model returns 120 and 180 for a table of 100 and 200", () => {
    const result = finalizeExtractedRows(
      [
        lineItem(120),
        lineItem(180, { subsector: "Railways", gpcRefNo: "II.2.1" }),
        total(300),
      ],
      2021,
      page("| Road | 100 |\n| Rail | 200 |\n| Total | 300 |"),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.valueCheck)).toEqual([
      "not_found",
      "not_found",
    ]);
    expect(result.summary.reportedTotals[0].inText).toBe(true);
  });

  it("finds a parenthesized negative and rejects the positive", () => {
    const text = "| Forestry | (811,512) |";
    const negative = finalizeExtractedRows(
      [lineItem(-811512)],
      2021,
      page(text),
    );
    expect(negative.rows[0].valueCheck).toBeUndefined();
    const positive = finalizeExtractedRows(
      [lineItem(811512)],
      2021,
      page(text),
    );
    expect(positive.rows[0].valueCheck).toBe("not_found");
  });

  it("accepts a rounded printed figure within its step", () => {
    const result = finalizeExtractedRows(
      [lineItem(12.9, { unit: "Mt" })],
      2021,
      page("| Waste | 12.9 |"),
    );
    expect(result.rows[0].valueCheck).toBeUndefined();
  });

  it("keeps notation-only rows unmarked", () => {
    const result = finalizeExtractedRows(
      [lineItem(null, { notationKey: "NE", unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | NE |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].valueCheck).toBeUndefined();
    expect(result.rows[0].unitCheck).toBeUndefined();
  });

  it("chunk path allows exact matches only", () => {
    const source = {
      source: { text: "Total 9,559.2 kt", kind: "document" as const },
    };
    const totals = finalizeExtractedRows([total(9559215)], 2021, source);
    expect(totals.summary.reportedTotals[0].inText).toBe(false);
    const items = finalizeExtractedRows(
      [lineItem(9559.2, { unit: "kt" })],
      2021,
      source,
    );
    expect(items.rows[0].valueCheck).toBeUndefined();
    expect(items.rows[0].totalCO2e).toBe(9559200);
  });

  it("records page and onTableLine on reported totals", () => {
    const result = finalizeExtractedRows(
      [lineItem(100, { page: 7 }), total(300, { page: 7 })],
      2021,
      page("Total emissions were 300 t.\n| Total | 300 |"),
    );
    expect(result.summary.reportedTotals[0]).toMatchObject({
      page: 7,
      onTableLine: true,
    });
    const prose = finalizeExtractedRows(
      [lineItem(100, { page: 7 }), total(300, { page: 7 })],
      2021,
      page("| Road | 100 |\nTotal emissions were 300 t."),
    );
    expect(prose.summary.reportedTotals[0]).toMatchObject({
      page: 7,
      onTableLine: false,
    });
  });
});

describe("CC-1163 stage 1: rows without a unit on a page naming another unit", () => {
  it("keeps a unit-less row on a kt page and marks it", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].unitCheck).toBe("missing");
    expect(result.rows[0].totalCO2e).toBe(1234);
    expect(result.summary.droppedRows.unsupported_unit).toBeUndefined();
  });

  it("marks a row with a blank unit on a kt page like a missing one", () => {
    for (const unit of ["", "  "]) {
      const result = finalizeExtractedRows(
        [lineItem(1234, { unit })],
        2021,
        page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].unitCheck).toBe("missing");
    }
  });

  it("marks a unit-less row on a mixed t and kt page", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Road | 1,234 |\n" +
          "Table 5: Emissions (kt CO2e)\n| Rail | 12.5 |",
      ),
    );
    expect(result.rows[0].unitCheck).toBe("missing");
  });

  it("marks a unit-less row on a kg page", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page("Tabla 4: Emisiones (kg CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows[0].unitCheck).toBe("missing");
  });

  it("does not mark a unit-less row when the table names tonnes and only a Figure names kt", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Road | 1,234 |\n" +
          "Figure 2: Emissions by sector (kt CO2e)",
      ),
    );
    expect(result.rows[0].unitCheck).toBeUndefined();
  });

  it("keeps a unit-less total on a kt page out of the reconciliation targets", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null }), total(1234, { unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |\n| Total | 1,234 |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.summary.reportedTotals).toEqual([]);
    expect(result.summary.droppedRows.unsupported_unit).toBe(1);
  });
});

/** Eight numbers of 3+ digits that are no row or total, so a page is sent to the model. */
const FILLER =
  "Notes 101,101 102,102 103,103 104,104 105,105 106,106 107,107 108,108\n";

/**
 * A document of the given pages. The mocked model answers each page call with
 * the rows given for that page, and the whole-document call (it names more than
 * one page marker) with `chunkRows`.
 */
function documentOf(
  pages: Record<number, { text: string; rows?: Record<string, unknown>[] }>,
  chunkRows: Record<string, unknown>[] = [],
): string {
  const entries = Object.entries(pages).map(
    ([n, p]) => [Number(n), p] as const,
  );
  complete.mockImplementation(async (args) => {
    const prompt = JSON.stringify(args);
    const hits = entries.filter(([n]) => prompt.includes(`PAGE-${n}-MARK`));
    const rows = hits.length === 1 ? (hits[0][1].rows ?? []) : chunkRows;
    return { content: JSON.stringify({ rows }) };
  });
  return (
    entries
      // The marker goes after the page text, so a page starting with a table
      // line still does (continued tables, see inheritedPageScales).
      .map(
        ([n, p]) => `<!-- page: ${n} -->\n${p.text}\nPAGE-${n}-MARK\n${FILLER}`,
      )
      .join("")
  );
}

const item = (
  subsector: string,
  gpcRefNo: string,
  totalCO2e: number,
): Record<string, unknown> => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector,
  scope: "1",
  gpcRefNo,
  totalCO2e,
  unit: "t",
  rowType: "line_item",
});

const totalOf = (
  totalCO2e: number,
  category = "Total",
): Record<string, unknown> => ({
  year: 2021,
  sector: null,
  subsector: null,
  category,
  totalCO2e,
  unit: "t",
  rowType: "total",
});

const targetValues = (
  totals: Parameters<typeof reconciliationTargets>[0],
): number[] => {
  const targets = reconciliationTargets(totals, 2021);
  return [...targets.grand, ...targets.net];
};

describe("CC-1163 stage 1: a reported total is a target only next to its rows", () => {
  it("invented 5,000,000 total with population 5.000 elsewhere is no target", async () => {
    // Page 3 has kt evidence, so 5.000 x 1000 reads as 5,000,000: the model's
    // total there is found in the text, but no line item is near it.
    const rows = [
      item("Residential Buildings", "I.1.1", 3000000),
      item("Commercial Buildings", "I.2.1", 2000000),
    ];
    const text = documentOf(
      {
        3: {
          text:
            "Table 1: City profile (kt CO2e)\n" +
            "Population 5.000\n1.234.567 2.345.678 3.456.789 4.567.890\n",
          rows: [totalOf(5000000)],
        },
        9: {
          text: "Residential buildings 3,000,000\nCommercial buildings 2,000,000\n",
          rows: [...rows, totalOf(5000000)],
        },
      },
      [...rows, totalOf(5000000)],
    );
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(targetValues(summary.reportedTotals)).not.toContain(5000000);
  });

  it("total on the page after its rows is a target", async () => {
    const text = documentOf({
      7: {
        text: "| Road | 100 |\n| Rail | 200 |",
        rows: [
          item("Residential Buildings", "I.1.1", 100),
          item("Commercial Buildings", "I.2.1", 200),
        ],
      },
      // Not a table line: only the previous-page check ties it to its rows.
      8: { text: "Total 300", rows: [totalOf(300)] },
    });
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.reportedTotals).toEqual([
      expect.objectContaining({
        value: 300,
        page: 8,
        onTableLine: false,
        rowsNearby: true,
      }),
    ]);
    expect(targetValues(summary.reportedTotals)).toContain(300);
  });

  it("total in prose on the page of its rows is a target", async () => {
    const text = documentOf({
      7: {
        // Not a table line: only the same-page check ties it to its rows.
        text: "| Road | 100 |\n| Rail | 200 |\nTotal 300",
        rows: [
          item("Residential Buildings", "I.1.1", 100),
          item("Commercial Buildings", "I.2.1", 200),
          totalOf(300),
        ],
      },
      12: { text: "Annex", rows: [] },
    });
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.reportedTotals).toEqual([
      expect.objectContaining({
        value: 300,
        page: 7,
        onTableLine: false,
        rowsNearby: true,
      }),
    ]);
    expect(targetValues(summary.reportedTotals)).toContain(300);
  });

  it("headline summary-table total far from its rows is a target", async () => {
    const text = documentOf({
      3: {
        text: "| Total emissions | 9,559,215 |",
        rows: [totalOf(9559215, "Total emissions")],
      },
      20: {
        text: "Residential buildings 5,000,000\n",
        rows: [item("Residential Buildings", "I.1.1", 5000000)],
      },
      21: {
        text: "Commercial buildings 4,559,215\n",
        rows: [item("Commercial Buildings", "I.2.1", 4559215)],
      },
    });
    const { summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.selectedPages).toEqual([20, 21]);
    expect(summary.reportedTotals).toEqual([
      expect.objectContaining({
        value: 9559215,
        page: 3,
        onTableLine: true,
        rowsNearby: true,
      }),
    ]);
    expect(targetValues(summary.reportedTotals)).toContain(9559215);
  });

  it("the same total in prose only is not a target", () => {
    // Driven through the merge step: with no target the page path falls back to
    // whole-document chunks, whose totals carry no page.
    const at = (n: number, text: string, rows: ExtractedRow[]) => ({
      page: n,
      result: finalizeExtractedRows(
        rows.map((row) => ({ ...row, page: n })),
        2021,
        { deferYearAssumption: true, ...page(text) },
      ),
    });
    const selected = selectReconciledPages(
      [
        at(3, "Total emissions were 9,559,215 t.", [
          total(9559215, { category: "Total emissions" }),
        ]),
        at(20, "Residential buildings 5,000,000", [
          lineItem(5000000, {
            sector: "Stationary Energy",
            subsector: "Residential Buildings",
            gpcRefNo: "I.1.1",
          }),
        ]),
        at(21, "Commercial buildings 4,559,215", [
          lineItem(4559215, {
            sector: "Stationary Energy",
            subsector: "Commercial Buildings",
            gpcRefNo: "I.2.1",
          }),
        ]),
      ],
      2021,
    );
    expect(selected.summary.reportedTotals).toEqual([
      expect.objectContaining({
        value: 9559215,
        page: 3,
        inText: true,
        onTableLine: false,
        rowsNearby: false,
      }),
    ]);
    expect(targetValues(selected.summary.reportedTotals)).not.toContain(
      9559215,
    );
    expect(selected.summary.pageSelection).toBe("fallback");
  });
});

describe("CC-1163 stage 1 with source checks: ambiguous numbers and MT", () => {
  // The document style is undetected; this page alone reads european.
  const europeanPage = {
    ...page("| Other | 1.234,5 |\n| Natural gas | 6.600 |"),
    documentStyle: "unknown" as const,
  };

  it.each([6.6, 6600])(
    "a value printed as 6.600 is found under either reading (model value %s)",
    (value) => {
      const result = finalizeExtractedRows(
        [lineItem(value, { category: "Natural gas", totalCO2eText: "6.600" })],
        2021,
        europeanPage,
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].numberCheck).toBe(true);
      expect(result.rows[0].valueCheck).toBeUndefined();
    },
  );

  it("an MT row on a kt page is an MT check, not a missing unit", async () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: "MT" })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].unitCheck).toBe("MT");
    const { reviewIssue } = await import("@/backend/ImportRowPreviewService");
    const row = {
      gpcRefNo: "II.1.1",
      review: { refSource: "document", unitCheck: result.rows[0].unitCheck },
    } as unknown as Parameters<typeof reviewIssue>[0];
    expect(reviewIssue(row)).not.toBe("unit-unconfirmed");
  });
});

describe("CC-1163 #3420: unit groups for rows without a printed unit", () => {
  const unitless = (value: number, page: number, gpcRefNo = "II.1.1") =>
    lineItem(value, { unit: null, page, gpcRefNo });

  it("groups unit-less rows by page and preselects kt on a kt-only page", () => {
    const result = finalizeExtractedRows(
      [
        unitless(1234, 12),
        unitless(56, 12, "II.2.1"),
        unitless(7, 12, "II.3.1"),
      ],
      2021,
      page(
        "Table 4: Emissions (kt CO2e)\n| Road | 1,234 |\n| Rail | 56 |\n| Water | 7 |",
      ),
    );
    expect(result.rows.map((r) => r.unitHint)).toEqual(["kt", "kt", "kt"]);
    expect(result.summary.sourceChecks?.unitGroups).toEqual([
      {
        key: "p12",
        page: 12,
        tableId: null,
        rowCount: 3,
        preselected: "kt",
        options: ["t", "kt", "Mt"],
        status: "pending",
        reading: null,
      },
    ]);
    // Rows keep their extracted values until the group is answered.
    expect(result.rows[0].totalCO2e).toBe(1234);
  });

  it("preselects kt for a row the model already scaled, with kt and t option totals", async () => {
    const { optionTotals } = await import("@/util/GHGI/source-checks");
    const result = finalizeExtractedRows(
      [{ ...unitless(1_234_000, 12), totalCO2eText: "1,234" }],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows[0]).toMatchObject({
      totalCO2e: 1_234_000,
      printedFactor: 1000,
      unitCheck: "missing",
    });
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p12",
      preselected: "kt",
    });
    const totals = optionTotals(
      result.rows,
      { units: {}, numberFormat: null },
      { unitGroup: "p12" },
    );
    expect(totals.find((o) => o.reading === "kt")?.total).toBe(1_234_000);
    expect(totals.find((o) => o.reading === "t")?.total).toBe(1234);
  });

  it("preselects kt from the rows' printed factor on a page that also names tonnes", () => {
    const result = finalizeExtractedRows(
      [{ ...unitless(1_234_000, 14), totalCO2eText: "1,234" }],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Sector | Total |\n" +
          "Table 5: Emissions (kt CO2e)\n| Road | 1,234 |",
      ),
    );
    expect(result.rows[0].printedFactor).toBe(1000);
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p14",
      preselected: "kt",
    });
  });

  it("preselects Mt on an Mt-only page", () => {
    const result = finalizeExtractedRows(
      [unitless(1.5, 3)],
      2021,
      page("Table 2: Emissions (Mt CO2e)\n| Road | 1.5 |"),
    );
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p3",
      preselected: "Mt",
    });
  });

  it("preselects t on a page naming more than one unit", () => {
    const result = finalizeExtractedRows(
      [unitless(1234, 14)],
      2021,
      page(
        "Table 4: Emissions (kt CO2e)\n| Road | 1,234 |\n" +
          "Table 5: Emissions (Mt CO2e)\n| Rail | 1.2 |",
      ),
    );
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p14",
      preselected: "t",
    });
  });

  it("preselects t on a page naming tonnes and kt", () => {
    const result = finalizeExtractedRows(
      [unitless(1234, 15)],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Road | 1,234 |\n" +
          "Table 5: Emissions (kt CO2e)\n| Rail | 12.5 |",
      ),
    );
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p15",
      preselected: "t",
    });
  });

  it("preselects kt on a page naming thousand tonnes", () => {
    const result = finalizeExtractedRows(
      [unitless(1234, 16)],
      2021,
      page("Table 4: Emissions (thousand tonnes CO2e)\n| Road | 1,234 |"),
    );
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p16",
      preselected: "kt",
    });
  });

  it("preselects t on a kg-only page (no kg option)", () => {
    const result = finalizeExtractedRows(
      [unitless(1234, 5)],
      2021,
      page("Tabla 4: Emisiones (kg CO2e)\n| Road | 1,234 |"),
    );
    expect(result.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p5",
      preselected: "t",
      options: ["t", "kt", "Mt"],
      kgOnly: true,
    });
  });

  it.each([
    ["kg only", "Tabla 4: Emisiones (kg CO2e)\n| Road | 1,234 |", true],
    [
      "kg and kt",
      "Tabla 4: Emisiones (kg CO2e)\n| Road | 1,234 |\n" +
        "Tabla 5: Emisiones (kt CO2e)\n| Rail | 7 |",
      false,
    ],
    ["kt only", "Table 4: Emissions (kt CO2e)\n| Road | 1,234 |", false],
  ])("flags kgOnly on a page naming %s", (_name, text, kgOnly) => {
    const result = finalizeExtractedRows([unitless(1234, 5)], 2021, page(text));
    const [group] = result.summary.sourceChecks?.unitGroups ?? [];
    expect(group.kgOnly ?? false).toBe(kgOnly);
    // Rebuilt from the stored rows without the page text, the flag stays.
    const again = finalizeExtractedRows(result.rows, 2021);
    expect(again.summary.sourceChecks?.unitGroups?.[0].kgOnly ?? false).toBe(
      kgOnly,
    );
  });

  it("does not flag kgOnly when the rows' printed factor read kt", () => {
    // Rebuilt from stored rows: a kg page, but the model scaled each row by 1000.
    const stored = [
      {
        ...unitless(1_234_000, 5),
        totalCO2eText: "1,234",
        printedFactor: 1000,
        unitCheck: "missing" as const,
        unitHint: "kg" as const,
      },
    ];
    const result = finalizeExtractedRows(stored, 2021);
    const [group] = result.summary.sourceChecks?.unitGroups ?? [];
    expect(group).toMatchObject({ key: "p5", preselected: "kt" });
    expect(group.kgOnly).toBeUndefined();
  });

  it("keeps the preselection when the checks are rebuilt without the page text", () => {
    const first = finalizeExtractedRows(
      [unitless(1234, 12)],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    const again = finalizeExtractedRows(first.rows, 2021);
    expect(again.summary.sourceChecks?.unitGroups?.[0]).toMatchObject({
      key: "p12",
      preselected: "kt",
    });
  });

  it("an MT row is not a page group", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: "MT", page: 12 })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    expect(result.summary.sourceChecks?.unit).toBeDefined();
    expect(result.summary.sourceChecks?.unitGroups).toBeUndefined();
  });
});

describe("CC-1163 task 5c: no false value holds on Phoenix and Santiago", () => {
  const phoenixPage =
    "Table ES-2. Stationary Energy GHG Emissions (thousand MT CO₂e)\n" +
    "| Sector | 2021 |\n| --- | --- |\n" +
    "| Residential Buildings | 3,190 |\n" +
    "| Manufacturing Industries & Construction | 80.3 |";

  it("finds kt line items under a thousand MT caption, short figures included", () => {
    const result = finalizeExtractedRows(
      [
        lineItem(3190000, { gpcRefNo: "I.1.1" }),
        lineItem(80300, { gpcRefNo: "I.3.1" }),
      ],
      2021,
      page(phoenixPage),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.valueCheck)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("keeps the 4-digit guard for reported totals", () => {
    const result = finalizeExtractedRows(
      [total(3190000), total(80300, { category: "Manufacturing" })],
      2021,
      page(phoenixPage),
    );
    expect(
      result.summary.reportedTotals.map((t) => [t.value, t.inText]),
    ).toEqual([
      [3190000, true],
      [80300, false],
    ]);
  });

  it("does not match a short figure in prose (the 2 of CO2e) scaled", () => {
    const result = finalizeExtractedRows(
      [lineItem(2000)],
      2021,
      page(
        "Table 4 Transport emissions (kt CO2e)\n" +
          "Emissions are reported in kt CO2e for 2021.\n" +
          "| Road | 1,234.5 |",
      ),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].valueCheck).toBe("not_found");
  });

  it("marks a unit-less row on a page continuing a kt table", () => {
    const p21 = "| Rail | 1,234.5 |\n| Bus | 80.3 |";
    const rows = [lineItem(1234500, { unit: null })];
    const own = finalizeExtractedRows(rows, 2021, page(p21));
    expect(own.rows[0].unitCheck).toBeUndefined();
    const inherited = finalizeExtractedRows(rows, 2021, {
      ...page(p21),
      inheritedScales: [1000],
    });
    expect(inherited.rows).toHaveLength(1);
    expect(inherited.rows[0].unitCheck).toBe("missing");
  });

  it("marks a unit-less p21 row after a p20 kt caption in the page loop", async () => {
    const text = documentOf({
      20: {
        text: "Table 3 Emissions (kt CO2e)\n| Sector | 2021 |\n| --- | --- |\n| Residential | 3,190.1 |",
        rows: [],
      },
      21: {
        text: "| Rail | 1,234.5 |",
        rows: [
          { ...item("Rail", "II.2.1", 1234.5), unit: null },
          { ...totalOf(1234.5), unit: null },
        ],
      },
    });
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    const rail = rows.find((r) => r.gpcRefNo === "II.2.1");
    expect(rail).toBeDefined();
    expect(rail?.unitCheck).toBe("missing");
  });

  it("preselects kt for the group of a page continuing a kt table", async () => {
    const text = documentOf({
      20: {
        text: "Table 3 Emissions (kt CO2e)\n| Sector | 2021 |\n| --- | --- |\n| Residential | 3,190.1 |",
        rows: [],
      },
      21: {
        text: "| Rail | 1,234.5 |\n| Bus | 2,080.3 |",
        rows: [
          { ...item("Rail", "II.2.1", 1234.5), unit: null },
          // The model applied the continued kt itself.
          {
            ...item("Bus", "II.1.1", 2_080_300),
            unit: null,
            totalCO2eText: "2,080.3",
          },
        ],
      },
    });
    const { rows, summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    const p21 = rows.filter((r) => r.page === 21);
    expect(p21.map((r) => r.unitHint)).toEqual(["kt", "kt"]);
    // The model's own x1000 is read as kt, so a kt answer does not scale twice.
    expect(p21.find((r) => r.gpcRefNo === "II.1.1")?.printedFactor).toBe(1000);
    expect(summary.sourceChecks?.unitGroups).toMatchObject([
      { key: "p21", preselected: "kt", rowCount: 2 },
    ]);
  });

  it("ignores the CO2e header digit and the I.1.1 reference for short matches", () => {
    const text = "| Sector | kt CO2e |\n| --- | --- |\n| I.1.1 | 80.3 |";
    const result = finalizeExtractedRows(
      [
        lineItem(2000, { gpcRefNo: "I.1.1" }),
        lineItem(1100, { gpcRefNo: "I.2.1" }),
        lineItem(80300, { gpcRefNo: "I.3.1" }),
      ],
      2021,
      page(text),
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.valueCheck)).toEqual([
      "not_found",
      "not_found",
      undefined,
    ]);
  });

  it("does not carry kt onto a prose demographics page (C6)", () => {
    const p9 = "Table 1 Emissions (kt CO2e)\n| Residential | 3,190.1 |";
    const p10 =
      "Population 5.000\n1.234.567 2.345.678 3.456.789 4.567.890\n" +
      "Residential buildings 3.000.000\nCommercial buildings 2.000.000\n";
    const inheritedScales = inheritedPageScales([
      { page: 9, text: p9 },
      { page: 10, text: p10 },
    ]).get(10);
    expect(inheritedScales).toEqual([]);
    const result = finalizeExtractedRows(
      [
        lineItem(3000000, { gpcRefNo: "I.1.1" }),
        lineItem(2000000, { gpcRefNo: "I.2.1" }),
        total(5000000, { page: 10 }),
      ],
      2021,
      { ...page(p10), inheritedScales },
    );
    const invented = result.summary.reportedTotals.find(
      (t) => t.value === 5000000,
    );
    expect(invented?.inText).toBe(false);
    expect(targetValues(result.summary.reportedTotals)).not.toContain(5000000);
  });

  it("checks a continued page with the inherited kg scale", () => {
    const p22 =
      "| Uso de Productos | KgCO2e/año | 85.668.155 | 85.668.155 |\n" +
      "| Disposición de residuos sólidos | KgCO2e/año | 77.495.011 | 77.495.011 |";
    const rows = [
      lineItem(85668.155, { gpcRefNo: "IV.2" }),
      lineItem(77495.011, { gpcRefNo: "III.1.1" }),
    ];
    const without = finalizeExtractedRows(rows, 2021, page(p22));
    expect(without.rows.map((r) => r.valueCheck)).toEqual([
      "not_found",
      "not_found",
    ]);
    const inherited = finalizeExtractedRows(rows, 2021, {
      ...page(p22),
      inheritedScales: [0.001],
    });
    expect(inherited.rows).toHaveLength(2);
    expect(inherited.rows.map((r) => r.valueCheck)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("carries the p20 kg header through p21 to a p22 line item in the page loop", async () => {
    const p22Item = {
      ...item("Uso de Productos", "IV.2", 85668.155),
      sector: "IPPU",
    };
    const text = documentOf({
      20: {
        text:
          "| Sector | TOTAL (KgCO2e) |\n| --- | --- |\n" +
          "| Energía | 104.801.192 |",
        rows: [],
      },
      21: { text: "| Residuos | 1.234.567 |", rows: [] },
      22: {
        text: "| Uso de Productos | KgCO2e/año | 85.668.155 | 85.668.155 |",
        // The table total, so the page reconciles and is selected.
        rows: [p22Item, totalOf(85668.155)],
      },
    });
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    const found = rows.find((r) => r.gpcRefNo === "IV.2");
    expect(found).toBeDefined();
    expect(found?.valueCheck).toBeUndefined();
  });
});
