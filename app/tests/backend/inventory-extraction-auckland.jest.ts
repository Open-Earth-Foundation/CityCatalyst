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
    expect(system).toContain("Do not convert units yourself");
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
