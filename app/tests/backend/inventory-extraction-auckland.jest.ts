/**
 * CC-1008: Auckland 2021 PDF import must not be inflated.
 * The LLM is mocked with the output a correct extraction gives for the Auckland
 * tables (fixture: tests/fixtures/auckland-2021-ocr-excerpt.md), plus the noise the
 * old extraction let through (totals, 2016 rows, repeated tables, wrong units).
 * These tests prove our code around the model, not the model itself.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  canonicalGpcRefNo,
  extractInventoryFromDocument,
  findHiddenRowTotals,
  splitDocumentPages,
  finalizeExtractedRows,
  tonnesMultiplier,
} = await import("@/backend/InventoryExtractionService");
const { reconcileExtraction } = await import("@/util/GHGI/extraction-summary");

const fixture = readFileSync(
  path.join(process.cwd(), "tests/fixtures/auckland-2021-ocr-excerpt.md"),
  "utf-8",
);

type LlmRow = Record<string, unknown>;

const line = (
  gpcRefNo: string,
  scope: "1" | "2" | "3",
  totalCO2e: number | null,
  sector: string,
  subsector: string,
  extra: LlmRow = {},
): LlmRow => ({
  year: 2021,
  sector,
  subsector,
  category: subsector,
  totalCO2e,
  unit: "tCO2e",
  rowType: "line_item",
  scope,
  gpcRefNo,
  source: "Table A-1",
  ...extra,
});

const SE = "Stationary Energy";
const TR = "Transportation";
const WA = "Waste";
const IP = "Industrial Processes And Product Uses";
const AF = "Agriculture Forestry And Other Land Use";

/** Table A-1: one row per non-empty scope cell, notation keys kept, totals marked. */
const tableA1: LlmRow[] = [
  line("I.1.1", "1", 196407, SE, "Residential Buildings"),
  line("I.1.2", "2", 450523, SE, "Residential Buildings"),
  line("I.1.3", "3", 33017, SE, "Residential Buildings"),
  line("I.2.1", "1", 462976, SE, "Commercial And Institutional Buildings"),
  line("I.2.2", "2", 116488, SE, "Commercial And Institutional Buildings"),
  line("I.2.3", "3", 8537, SE, "Commercial And Institutional Buildings"),
  line("I.3.1", "1", 1085100, SE, "Manufacturing Industries And Construction"),
  line("I.3.2", "2", 441064, SE, "Manufacturing Industries And Construction"),
  line("I.3.3", "3", 32323, SE, "Manufacturing Industries And Construction"),
  line("I.4.4", "1", 32, SE, "Energy Industries", {
    category: "Energy generation supplied to the grid",
  }),
  line("I.5.1", "1", 160984, SE, "Agriculture Forestry And Fishing Activities"),
  line("I.5.2", "2", 113761, SE, "Agriculture Forestry And Fishing Activities"),
  line("I.5.3", "3", 8337, SE, "Agriculture Forestry And Fishing Activities"),
  line(
    "I.8.1",
    "1",
    50718,
    SE,
    "Fugitive Emissions From Oil And Natural Gas Systems",
  ),
  line("II.1.1", "1", 4018564, TR, "On Road Transportation"),
  line("II.1.2", "2", 2186, TR, "On Road Transportation"),
  line("II.1.3", "3", 160, TR, "On Road Transportation"),
  line("II.2.1", "1", 5673, TR, "Railways"),
  line("II.2.2", "2", 3629, TR, "Railways"),
  line("II.2.3", "3", 266, TR, "Railways"),
  line("II.3.1", "1", 18459, TR, "Waterborne Navigation"),
  line("II.3.2", "2", null, TR, "Waterborne Navigation", { notationKey: "IE" }),
  line("II.3.3", "3", 125941, TR, "Waterborne Navigation"),
  line("II.4.1", "1", null, TR, "Aviation", { notationKey: "NO" }),
  line("II.4.2", "2", null, TR, "Aviation", { notationKey: "IE" }),
  line("II.4.3", "3", 249950, TR, "Aviation"),
  line("III.1.1", "1", 178730, WA, "Solid Waste Disposal"),
  line("III.1.2", "3", 82991, WA, "Solid Waste Disposal"),
  line("III.4.1", "1", 64986, WA, "Wastewater Treatment And Discharge"),
  line("III.4.2", "3", null, WA, "Wastewater Treatment And Discharge", {
    notationKey: "NO",
  }),
  line("IV.1", "1", 1768428, IP, "Industrial Processes"),
  line("IV.2", "1", 483000, IP, "Product Use"),
  line("V.1", "1", 458485, AF, "Livestock"),
  line("V.2", "1", -1313386, AF, "Land"),
  line(
    "V.3",
    "1",
    250918,
    AF,
    "Aggregate Sources And Non Co2 Emission Sources On Land",
  ),
];

/** Rows the model also returns: per-row totals, sector subtotals, grand totals. */
const totals: LlmRow[] = [
  line("I.1", "1", 679947, SE, "Residential Buildings", {
    rowType: "subtotal",
    scope: null,
  }),
  line("I.2", "1", 588000, SE, "Commercial And Institutional Buildings", {
    rowType: "subtotal",
    scope: null,
  }),
  line("II", "1", 4424829, TR, "On Road Transportation", {
    rowType: "subtotal",
    scope: null,
    category: "SUB-TOTAL",
  }),
  {
    year: 2021,
    sector: null,
    subsector: null,
    category: "BASIC",
    totalCO2e: 7453238,
    unit: "tCO2e",
    rowType: "total",
    source: "Table 3-1",
  },
  {
    year: 2021,
    sector: null,
    subsector: null,
    category: "BASIC+",
    totalCO2e: 9559215,
    unit: "tCO2e",
    rowType: "total",
    source: "Table 3-1",
  },
  {
    year: 2021,
    sector: null,
    subsector: null,
    category: "TOTAL",
    totalCO2e: 9559215,
    unit: "tCO2e",
    rowType: "total",
    source: "Table A-1",
  },
];

/** Table A-4 compares 2016 values in kt. The old extraction relabeled them as 2021 tonnes. */
const tableA4: LlmRow[] = [
  line("I.1.2", "2", 903, SE, "Residential Buildings", {
    year: 2016,
    unit: "ktCO2e",
    category: "Electricity",
    source: "Table A-4",
  }),
  line("I.1.1", "1", 965, SE, "Residential Buildings", {
    year: 2016,
    unit: "ktCO2e",
    category: "Natural gas",
    source: "Table A-4",
  }),
  line("I.1.1", "1", 262, SE, "Residential Buildings", {
    year: null,
    unit: "ktCO2e",
    category: "LPG",
    source: "Table A-4",
  }),
];

function mockLlm(rows: LlmRow[]): void {
  complete.mockResolvedValue({ content: JSON.stringify({ rows }) });
}

beforeEach(() => {
  complete.mockReset();
});

describe("Auckland 2021 extraction", () => {
  it("imports one line item per scope and reconciles with the document total", async () => {
    mockLlm([...tableA1, ...totals, ...tableA4]);

    const { rows, summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    expect(summary.importedSum).toBe(9559215);
    expect(rows.every((row) => row.year === 2021)).toBe(true);
    expect(
      rows.every((row) => (row.rowType ?? "line_item") === "line_item"),
    ).toBe(true);
    expect(rows).toHaveLength(tableA1.length);

    const reconciliation = reconcileExtraction(summary);
    expect(reconciliation?.reportedTotal).toBe(9559215);
    expect(reconciliation?.mismatch).toBe(false);
  });

  it("keeps scope 1, 2 and 3 on their own GPC references", async () => {
    mockLlm(tableA1);
    const { rows } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });
    const residential = rows.filter(
      (r) => r.subsector === "Residential Buildings",
    );

    expect(residential.map((r) => [r.gpcRefNo, r.scope, r.totalCO2e])).toEqual([
      ["I.1.1", "1", 196407],
      ["I.1.2", "2", 450523],
      ["I.1.3", "3", 33017],
    ]);
  });

  it("moves totals and subtotals to reportedTotals, not rows", async () => {
    mockLlm([...tableA1, ...totals]);
    const { rows, summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    expect(
      rows.some((r) => r.totalCO2e === 9559215 || r.totalCO2e === 679947),
    ).toBe(false);
    expect(summary.droppedRows.subtotal_or_total).toBe(totals.length);
    expect(
      summary.reportedTotals
        .filter((t) => t.level === "total")
        .map((t) => t.value),
    ).toEqual([7453238, 9559215, 9559215]);
  });

  it("drops 2016 and year-less rows from the comparison table", async () => {
    mockLlm([...tableA1, ...tableA4]);
    const { rows, summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    expect(
      rows.some((r) => r.category === "Electricity" || r.category === "LPG"),
    ).toBe(false);
    expect(summary.droppedRows.other_year).toBe(2);
    expect(summary.droppedRows.missing_year).toBe(1);
  });

  it("places I.4.4 under I.4.4 and keeps it out of the imported sum", async () => {
    mockLlm(tableA1);
    const { rows, summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    const grid = rows.filter((r) => r.gpcRefNo === "I.4.4");
    expect(grid).toHaveLength(1);
    expect(grid[0].totalCO2e).toBe(32);
    expect(rows.some((r) => r.gpcRefNo === "I.4.1" && r.totalCO2e === 32)).toBe(
      false,
    );
    const sumWithGrid = rows.reduce((sum, r) => sum + (r.totalCO2e ?? 0), 0);
    expect(sumWithGrid - summary.importedSum).toBe(32);
  });

  it("keeps notation keys as rows without a value", async () => {
    mockLlm(tableA1);
    const { rows } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    const notation = rows
      .filter((r) => r.notationKey)
      .map((r) => [r.gpcRefNo, r.notationKey, r.totalCO2e]);
    expect(notation).toEqual([
      ["II.3.2", "IE", null],
      ["II.4.1", "NO", null],
      ["II.4.2", "IE", null],
      ["III.4.2", "NO", null],
    ]);
  });

  it("drops a table repeated with the same reference, scope and activity", async () => {
    const repeated = line(
      "II.1.1",
      "1",
      4048511,
      TR,
      "On Road Transportation",
      {
        source: "Table 3-1",
      },
    );
    mockLlm([...tableA1, repeated]);
    const { rows, summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });

    expect(rows.filter((r) => r.gpcRefNo === "II.1.1")).toHaveLength(1);
    expect(rows.find((r) => r.gpcRefNo === "II.1.1")?.totalCO2e).toBe(4018564);
    expect(summary.droppedRows.duplicate).toBe(1);
  });

  it("asks the model for rowType, unit and scope columns", async () => {
    mockLlm(tableA1);
    await extractInventoryFromDocument(fixture, { targetYear: 2021 });

    const call = complete.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    const system = call.messages.find((m) => m.role === "system")!.content;
    const user = call.messages.find((m) => m.role === "user")!.content;
    expect(system).toContain('"rowType"');
    expect(system).toContain("one row per non-empty scope cell");
    expect(system).toContain("BASIC+");
    expect(system).toContain("Output totalCO2e in metric tonnes CO2e");
    expect(user).toContain("Table A-1");
    expect(user).toContain("year 2021");
  });

  it("throws when every row belongs to another year", async () => {
    mockLlm(tableA4.map((row) => ({ ...row, year: 2016 })));
    await expect(
      extractInventoryFromDocument(fixture, { targetYear: 2021 }),
    ).rejects.toThrow("Inventory not found for the target year");
  });
});

describe("reconcileExtraction", () => {
  it("flags the inflated Auckland import", () => {
    const reconciliation = reconcileExtraction({
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
      ],
    });
    expect(reconciliation?.mismatch).toBe(true);
    expect(reconciliation?.deviation).toBeGreaterThan(2.4);
  });

  it("accepts a sum that matches any reported total within 1%", () => {
    const totalsList = [7453238, 9559215].map((value) => ({
      label: "t",
      value,
      year: 2021,
      scope: null,
      sector: null,
      subsector: null,
      level: "total" as const,
    }));
    expect(
      reconcileExtraction({ importedSum: 7453238, reportedTotals: totalsList })
        ?.mismatch,
    ).toBe(false);
    expect(
      reconcileExtraction({
        importedSum: 9559215 * 1.009,
        reportedTotals: totalsList,
      })?.mismatch,
    ).toBe(false);
    expect(
      reconcileExtraction({
        importedSum: 9559215 * 1.02,
        reportedTotals: totalsList,
      })?.mismatch,
    ).toBe(true);
  });

  it("ignores a grand total of another year", () => {
    const reconciliation = reconcileExtraction({
      importedSum: 12016000,
      targetYear: 2021,
      reportedTotals: [
        {
          label: "Gross emissions",
          value: 12016000,
          year: 2016,
          scope: null,
          sector: null,
          subsector: null,
          level: "total",
        },
        {
          label: "TOTAL",
          value: 9559215,
          year: 2021,
          scope: null,
          sector: null,
          subsector: null,
          level: "total",
        },
      ],
    });
    expect(reconciliation?.reportedTotal).toBe(9559215);
    expect(reconciliation?.mismatch).toBe(true);
  });

  it("gives no verdict without a reported grand total", () => {
    expect(
      reconcileExtraction({ importedSum: 100, reportedTotals: [] }),
    ).toBeNull();
    expect(
      reconcileExtraction({
        importedSum: 100,
        reportedTotals: [
          {
            label: "sub",
            value: 90,
            year: 2021,
            scope: null,
            sector: null,
            subsector: null,
            level: "subtotal",
          },
        ],
      }),
    ).toBeNull();
    expect(reconcileExtraction(null)).toBeNull();
  });
});

describe("finalizeExtractedRows units and years", () => {
  const base = {
    sector: SE,
    subsector: "Residential Buildings",
    category: "Natural gas",
  };

  it("converts kt and Mt to tonnes and treats a missing unit as tonnes", () => {
    const { rows } = finalizeExtractedRows(
      [
        {
          ...base,
          year: 2021,
          totalCO2e: 2.5,
          unit: "kt CO2e",
          gpcRefNo: "I.1.1",
        },
        { ...base, year: 2021, totalCO2e: 1.2, unit: "Mt", gpcRefNo: "I.1.2" },
        { ...base, year: 2021, totalCO2e: 300, unit: null, gpcRefNo: "I.1.3" },
      ],
      2021,
    );
    expect(rows.map((r) => r.totalCO2e)).toEqual([2500, 1_200_000, 300]);
  });

  it("drops rows in a unit that cannot be converted", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        {
          ...base,
          year: 2021,
          totalCO2e: 5,
          unit: "kg CO2e/capita",
          gpcRefNo: "I.1.1",
        },
      ],
      2021,
    );
    expect(rows).toHaveLength(0);
    expect(summary.droppedRows.unsupported_unit).toBe(1);
  });

  it("assumes the target year only when no row names a year", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        { ...base, year: null, totalCO2e: 1, gpcRefNo: "I.1.1" },
        { ...base, year: null, totalCO2e: 2, gpcRefNo: "I.1.2" },
      ],
      2021,
    );
    expect(rows.map((r) => r.year)).toEqual([2021, 2021]);
    expect(summary.yearAssumed).toBe(true);
  });

  it("does not assume a year when some row names one", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        { ...base, year: 2021, totalCO2e: 1, gpcRefNo: "I.1.1" },
        { ...base, year: null, totalCO2e: 2, gpcRefNo: "I.1.2" },
      ],
      2021,
    );
    expect(rows).toHaveLength(1);
    expect(summary.yearAssumed).toBe(false);
    expect(summary.droppedRows.missing_year).toBe(1);
  });

  it("keeps rows stored without the new fields", () => {
    const { rows } = finalizeExtractedRows([
      { ...base, year: 2021, totalCO2e: 10, gpcRefNo: "I.1.1" },
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("tonnesMultiplier", () => {
  it.each([
    [undefined, 1],
    ["", 1],
    ["t", 1],
    ["tCO2e", 1],
    ["metric tonnes CO2e", 1],
    ["tonnes", 1],
    ["kt", 1000],
    ["ktCO2e", 1000],
    ["kt CO2-e", 1000],
    ["thousand tonnes", 1000],
    ["Gg", 1000],
    ["Mt", 1_000_000],
    ["MtCO2e", 1_000_000],
    ["million tonnes", 1_000_000],
    ["MT", null],
    ["kg", null],
    ["lb", null],
    ["tCO2e per capita", null],
  ])("%s", (unit, expected) => {
    expect(tonnesMultiplier(unit as string | undefined)).toBe(expected);
  });
});

describe("references copied from the real model output (CC-1008 live run)", () => {
  it("completes a reference written once for all scopes", () => {
    expect(canonicalGpcRefNo("I.1", "1")).toBe("I.1.1");
    expect(canonicalGpcRefNo("I.1", "2")).toBe("I.1.2");
    expect(canonicalGpcRefNo("II.4", "3")).toBe("II.4.3");
    expect(canonicalGpcRefNo("I.4.4", "1")).toBe("I.4.4");
    expect(canonicalGpcRefNo("IV.1", "1")).toBe("IV.1");
  });

  it("drops combined and placeholder references", () => {
    expect(canonicalGpcRefNo("III.1.1/2", "1")).toBeNull();
    expect(canonicalGpcRefNo("III.X.1", "1")).toBeNull();
    expect(canonicalGpcRefNo("I.1", null)).toBeNull();
    expect(canonicalGpcRefNo("", "1")).toBeNull();
    expect(canonicalGpcRefNo(undefined, "1")).toBeNull();
  });

  it("resolves a row without a usable reference from sector, sub-sector and scope", async () => {
    mockLlm([
      line("I.1", "2", 450523, SE, "Residential Buildings"),
      line("III.1.1/2", "3", 82991, WA, "Solid Waste Disposal"),
    ]);
    const { rows } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });
    expect(rows.map((r) => r.gpcRefNo)).toEqual(["I.1.2", "III.1.2"]);
  });

  it("treats rows labeled as a sum as subtotals even when marked line_item", () => {
    const base = {
      year: 2021,
      sector: TR,
      subsector: "On Road Transportation",
    };
    const { rows, summary } = finalizeExtractedRows(
      [
        { ...base, category: "(All II emissions)", totalCO2e: 2251428 },
        { ...base, category: "Subtotal", totalCO2e: 327000 },
        { ...base, category: "Total", totalCO2e: 9559215 },
        { ...base, category: "Subsector total", totalCO2e: 100 },
        { ...base, category: "Diesel", totalCO2e: 50 },
      ],
      2021,
    );
    expect(rows.map((r) => r.category)).toEqual(["Subsector total", "Diesel"]);
    expect(summary.droppedRows.subtotal_or_total).toBe(3);
  });
});

describe("page-by-page extraction with reconciliation (CC-1008 amendment)", () => {
  const numbers = (n: number) =>
    Array.from({ length: n }, (_, i) => `${100 + i},${100 + i}`).join(" ");
  const page = (n: number, title: string, withNumbers = true) =>
    `<!-- page: ${n} -->
${title}
${withNumbers ? numbers(10) : "Prose only."}
`;

  const grandTotal = {
    year: 2021,
    sector: null,
    subsector: null,
    category: "BASIC+",
    totalCO2e: 9559215,
    unit: "t",
    rowType: "total",
  };
  /** Rounded figures from the sector chapters: the noise seen in the live run. */
  const narrative: LlmRow[] = [
    line("II.1.1", "1", 1800000, TR, "On Road Transportation", {
      category: "Diesel",
    }),
    line("II.1.1", "1", 1200000, TR, "On Road Transportation", {
      category: "Petrol",
    }),
    line("V.1", "1", 594000, AF, "Livestock", { category: "Livestock" }),
  ];
  const junkFromSummary = line("I.4.4", "1", 4048691, SE, "Energy Industries", {
    category: "Energy generation supplied to the grid",
  });

  function mockByPage(byTitle: Record<string, LlmRow[]>): void {
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      const title = Object.keys(byTitle).find((t) => user.includes(t));
      return { content: JSON.stringify({ rows: title ? byTitle[title] : [] }) };
    });
  }

  it("keeps only the page whose sum matches the document total", async () => {
    const doc = [
      page(2, "Contents", false),
      page(15, "Table 3-1 Emissions summary"),
      page(17, "Chapter 4 narrative"),
      page(46, "Table A-1 GPC format"),
    ].join("");
    mockByPage({
      "Table 3-1": [grandTotal, junkFromSummary],
      "Chapter 4": narrative,
      "Table A-1": tableA1,
    });

    const { rows, summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });

    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.selectedPages).toEqual([46]);
    expect(summary.importedSum).toBe(9559215);
    expect(rows).toHaveLength(tableA1.length);
    expect(summary.droppedRows.other_page).toBe(narrative.length + 1);
    // The page without numbers is never sent to the model. Page 15 is asked
    // twice: its rows (only I.4.4) miss its own total.
    expect(complete).toHaveBeenCalledTimes(4);
  });

  it("joins a table split over two consecutive pages", async () => {
    const half = Math.ceil(tableA1.length / 2);
    const doc = [
      page(15, "Table 3-1 Emissions summary"),
      page(46, "Table A-1 part one"),
      page(47, "Table A-1 part two"),
    ].join("");
    mockByPage({
      "Table 3-1": [grandTotal],
      "part one": tableA1.slice(0, half),
      "part two": tableA1.slice(half),
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.selectedPages).toEqual([46, 47]);
    expect(summary.importedSum).toBe(9559215);
  });

  it("does not join pages that are not consecutive", async () => {
    const half = Math.ceil(tableA1.length / 2);
    const doc = [
      page(15, "Table 3-1 Emissions summary"),
      page(46, "Table A-1 part one"),
      page(48, "Table A-1 part two"),
    ].join("");
    mockByPage({
      "Table 3-1": [grandTotal],
      "part one": tableA1.slice(0, half),
      "part two": tableA1.slice(half),
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
  });

  it("falls back to whole-document extraction when no page reconciles", async () => {
    const doc = [page(17, "Chapter 4 narrative"), page(46, "Table A-1")].join(
      "",
    );
    const seen: string[] = [];
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      seen.push(user);
      const whole = user.includes("Chapter 4") && user.includes("Table A-1");
      const rows = whole
        ? tableA1
        : user.includes("Chapter 4")
          ? narrative
          : tableA1;
      return { content: JSON.stringify({ rows }) };
    });

    const { rows, summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
    // Two page calls, then one call with the whole document.
    expect(seen).toHaveLength(3);
    expect(seen[2]).toContain("Chapter 4");
    expect(seen[2]).toContain("Table A-1");
    expect(rows).toHaveLength(tableA1.length);
  });

  it("skips a page the model cannot answer and keeps the others", async () => {
    const doc = [
      page(15, "Table 3-1 Emissions summary"),
      page(17, "Chapter 4 narrative"),
      page(46, "Table A-1 GPC format"),
    ].join("");
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      if (user.includes("Chapter 4")) return { content: "not json at all" };
      if (user.includes("Table 3-1")) {
        return { content: JSON.stringify({ rows: [grandTotal] }) };
      }
      return { content: JSON.stringify({ rows: tableA1 }) };
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.selectedPages).toEqual([46]);
    expect(summary.importedSum).toBe(9559215);
  });

  it("uses LLM_EXTRACTION_MODEL when set", async () => {
    process.env.LLM_EXTRACTION_MODEL = "gpt-4o";
    try {
      mockLlm(tableA1);
      await extractInventoryFromDocument(fixture, { targetYear: 2021 });
      expect((complete.mock.calls[0][0] as { model?: string }).model).toBe(
        "gpt-4o",
      );
    } finally {
      delete process.env.LLM_EXTRACTION_MODEL;
    }
  });

  it("ignores a grand total of another year when selecting", async () => {
    const doc = [
      page(15, "Table A-2 2016 profile"),
      page(17, "Chapter 4 narrative"),
    ].join("");
    mockByPage({
      "Table A-2": [{ ...grandTotal, year: 2016, totalCO2e: 3594000 }],
      "Chapter 4": narrative,
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
  });

  it("prefers the GPC table over a narrative page that matches the gross total", async () => {
    // Live run: the model missed rows on Table A-1 (6% short) while a chapter
    // listing gross emissions by source matched the gross total exactly.
    const incompleteA1 = tableA1.filter(
      (r) => r.gpcRefNo !== "I.3.2" && r.gpcRefNo !== "I.2.2",
    );
    const gross = {
      ...grandTotal,
      category: "Gross emissions",
      totalCO2e: 10757000,
    };
    const grossBreakdown: LlmRow[] = [
      line("II.1.1", "1", 5000000, TR, "On Road Transportation", {
        scope: null,
        category: "Transport",
      }),
      line("I.1.1", "1", 5757000, SE, "Residential Buildings", {
        scope: null,
        category: "Energy",
      }),
    ];
    const doc = [
      page(15, "Table 3-1 Emissions summary"),
      page(37, "Chapter gross emissions"),
      page(46, "Table A-1 GPC format"),
    ].join("");
    mockByPage({
      "Table 3-1": [grandTotal],
      "Chapter gross": [gross, ...grossBreakdown],
      "Table A-1": incompleteA1,
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.selectedPages).toEqual([46]);
    // The review warning still flags the missing rows.
    expect(reconcileExtraction(summary)?.mismatch).toBe(true);
  });

  it("does not select one sector because its total was marked as a total", async () => {
    const transport = tableA1.filter((r) =>
      String(r.gpcRefNo).startsWith("II."),
    );
    const transportSum = transport.reduce(
      (n, r) => n + Number(r.totalCO2e ?? 0),
      0,
    );
    const doc = [
      page(15, "Table 3-1 Emissions summary"),
      page(24, "Chapter transport"),
    ].join("");
    mockByPage({
      "Table 3-1": [grandTotal],
      "Chapter transport": [
        { ...grandTotal, category: "Total", totalCO2e: transportSum },
        ...transport,
      ],
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("fallback");
  });

  it("asks a page once more when its rows miss the page total", async () => {
    // Live run: the same page lost the scope 3 column on one call out of three.
    const withoutScope3 = tableA1.filter((r) => r.scope !== "3");
    const doc = [page(46, "Table A-1 GPC format"), page(47, "Notes")].join("");
    let calls = 0;
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      if (!user.includes("Table A-1")) return { content: '{"rows": []}' };
      calls += 1;
      const rows = calls === 1 ? withoutScope3 : tableA1;
      return { content: JSON.stringify({ rows: [grandTotal, ...rows] }) };
    });

    const { summary } = await extractInventoryFromDocument(doc, {
      targetYear: 2021,
    });
    expect(calls).toBe(2);
    expect(summary.selectedPages).toEqual([46]);
    expect(summary.importedSum).toBe(9559215);
  });

  it("keeps the chunk path for text without page breaks", async () => {
    mockLlm(tableA1);
    const { summary } = await extractInventoryFromDocument(fixture, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("splits Mistral page markers and form feeds", () => {
    expect(
      splitDocumentPages("<!-- page: 1 -->\nA\n<!-- page: 2 -->\nB").map(
        (p) => [p.page, p.text.trim()],
      ),
    ).toEqual([
      [1, "A"],
      [2, "B"],
    ]);
    expect(splitDocumentPages("A\fB\fC").map((p) => p.page)).toEqual([1, 2, 3]);
    expect(splitDocumentPages("no breaks")).toEqual([]);
  });
});

describe("findHiddenRowTotals", () => {
  it("finds a Total column read as a line item without scope", () => {
    const rows = [
      {
        year: 2021,
        sector: SE,
        subsector: "Residential Buildings",
        category: null,
        scope: "1",
        gpcRefNo: "I.1.1",
        totalCO2e: 196407,
      },
      {
        year: 2021,
        sector: SE,
        subsector: "Residential Buildings",
        category: null,
        scope: "2",
        gpcRefNo: "I.1.2",
        totalCO2e: 450523,
      },
      {
        year: 2021,
        sector: SE,
        subsector: "Residential Buildings",
        category: null,
        scope: "3",
        gpcRefNo: "I.1.3",
        totalCO2e: 33017,
      },
      {
        year: 2021,
        sector: SE,
        subsector: "Residential Buildings",
        category: null,
        scope: null,
        gpcRefNo: "I.1.1",
        totalCO2e: 679947,
      },
      {
        year: 2021,
        sector: SE,
        subsector: "Manufacturing",
        category: null,
        scope: null,
        gpcRefNo: null,
        totalCO2e: 50,
      },
    ];
    const hidden = findHiddenRowTotals(rows);
    expect([...hidden].map((r) => r.totalCO2e)).toEqual([679947]);
  });

  it("drops the hidden total during finalize and keeps the scoped rows", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        {
          year: 2021,
          sector: TR,
          subsector: "Railways",
          category: null,
          scope: "1",
          gpcRefNo: "II.2.1",
          totalCO2e: 5673,
        },
        {
          year: 2021,
          sector: TR,
          subsector: "Railways",
          category: null,
          scope: "2",
          gpcRefNo: "II.2.2",
          totalCO2e: 3629,
        },
        {
          year: 2021,
          sector: TR,
          subsector: "Railways",
          category: null,
          scope: "3",
          gpcRefNo: "II.2.3",
          totalCO2e: 266,
        },
        {
          year: 2021,
          sector: TR,
          subsector: "Railways",
          category: null,
          scope: null,
          gpcRefNo: null,
          totalCO2e: 9568,
        },
      ],
      2021,
    );
    expect(rows).toHaveLength(3);
    expect(summary.importedSum).toBe(9568);
    expect(summary.droppedRows.subtotal_or_total).toBe(1);
  });
});
