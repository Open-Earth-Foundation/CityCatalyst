/**
 * CC-1163: extraction keeps what the review checks need: "MT" rows read as
 * tonnes, the printed text of each value, and the candidate document totals.
 * The LLM is mocked; these tests prove the code around the model.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const complete = jest.fn<(args: unknown) => Promise<{ content: string }>>();
const warn = jest.fn();

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

jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn, info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const {
  extractInventoryFromDocument,
  finalizeExtractedRows,
  selectReconciledPages,
} = await import("@/backend/InventoryExtractionService");
const { applyReadings, selectLevelTotal } =
  await import("@/util/GHGI/source-checks");
type ExtractedRow = Parameters<typeof finalizeExtractedRows>[0][number];

beforeEach(() => {
  complete.mockReset();
  warn.mockReset();
});

const lineItem = (over: Partial<ExtractedRow> = {}): ExtractedRow => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: "Natural gas",
  scope: "1",
  gpcRefNo: "I.1.1",
  totalCO2e: 1000,
  unit: "t",
  rowType: "line_item",
  ...over,
});

const total = (
  category: string,
  totalCO2e: number,
  over: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: null,
  subsector: null,
  category,
  totalCO2e,
  unit: "t",
  rowType: "total",
  ...over,
});

const countryDefault = (numberFormat: "european" | "english") => ({
  numberFormat,
  numberFormatSource: "country_default" as const,
});

describe("unit check", () => {
  it("keeps MT rows as tonnes", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        lineItem({
          unit: "MT",
          totalCO2e: 252514,
          source: "Table 4",
          page: 15,
        }),
      ],
      2021,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totalCO2e: 252514,
      unitCheck: "MT",
      unit: "t",
    });
    expect(summary.droppedRows.unsupported_unit).toBeUndefined();
    expect(summary.sourceChecks?.unit).toEqual({
      status: "pending",
      reading: "t",
      evidence: {
        unitText: "MT",
        sources: ["Table 4"],
        pages: [15],
        example: { label: "Natural gas", text: "252514" },
      },
    });
  });

  it("MT total kept with source and page", () => {
    const { summary } = finalizeExtractedRows(
      [
        lineItem({ unit: "MT", totalCO2e: 100, source: "Table 4", page: 15 }),
        total("Total", 3250886, {
          unit: "MT CO2e",
          source: "Table 4",
          page: 19,
        }),
      ],
      2021,
    );
    expect(summary.reportedTotals).toHaveLength(1);
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 3250886,
      unitCheck: "MT",
      source: "Table 4",
      page: 19,
    });
    expect(summary.sourceChecks?.unit?.evidence.pages).toEqual([15, 19]);
  });

  it("no MT, no unit check: Mt stays megatonnes and mt stays tonnes", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        lineItem({ unit: "mt", totalCO2e: 50 }),
        lineItem({
          category: "Electricity",
          scope: "2",
          gpcRefNo: "I.1.2",
          unit: "Mt",
          totalCO2e: 2,
        }),
      ],
      2021,
    );
    expect(rows.map((r) => r.totalCO2e)).toEqual([50, 2_000_000]);
    expect(rows.every((r) => r.unitCheck == null)).toBe(true);
    expect(summary.sourceChecks?.unit).toBeUndefined();
  });
});

describe("number format check", () => {
  const undetected = "| I.1.1 | Natural gas | 6.600 |\n";

  it("ambiguous separator with undetected style reads english by default", () => {
    const { rows, summary } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6 })],
      2021,
      { source: { text: undetected, kind: "document" } },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6.6,
      totalCO2eText: "6.600",
      numberCheck: true,
      printedFactor: 1,
    });
    expect(summary.importedSum).toBe(6.6);
    expect(summary.sourceChecks?.numberFormat).toEqual({
      status: "pending",
      reading: "english",
      examples: [{ label: "Natural gas", text: "6.600" }],
    });
  });

  it("ambiguous separator follows a european country default", () => {
    const { rows, summary } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6 })],
      2021,
      {
        source: { text: undetected, kind: "document" },
        sourceMetadata: countryDefault("european"),
      },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6600,
      numberCheck: true,
      printedFactor: 1,
    });
    expect(summary.importedSum).toBe(6600);
    expect(summary.sourceChecks?.numberFormat?.reading).toBe("european");
  });

  it("caps the examples at three", () => {
    const { summary } = finalizeExtractedRows(
      ["Natural gas", "Diesel", "Coal", "Oil"].map((category, i) =>
        lineItem({
          category,
          gpcRefNo: null,
          totalCO2eText: `${i + 1}.500`,
          totalCO2e: i + 1.5,
        }),
      ),
      2021,
    );
    expect(summary.sourceChecks?.numberFormat?.examples).toHaveLength(3);
  });

  it("detected style, no number check", () => {
    const text = "1.234.567 1.234.567 1.234.567\n" + undetected;
    const { rows, summary } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6600 })],
      2021,
      { source: { text, kind: "document" } },
    );
    expect(rows[0].numberCheck).toBeUndefined();
    expect(rows[0].printedFactor).toBe(1);
    expect(summary.sourceChecks?.numberFormat).toBeUndefined();
  });

  it("kt printed factor", () => {
    const text = "Table 3: Emissions (kt CO2e)\n| Natural gas | 48 |\n";
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "48", totalCO2e: 48000, unit: "t" })],
      2021,
      { source: { text, kind: "page" } },
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 48000, printedFactor: 1000 });
    expect(rows[0].numberCheck).toBeUndefined();
  });

  it("ignores mismatched printed text", () => {
    const { rows, summary } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "12.345", totalCO2e: 999 })],
      2021,
    );
    expect(rows[0].totalCO2e).toBe(999);
    expect(rows[0].numberCheck).toBeUndefined();
    expect(rows[0].totalCO2eText).toBeUndefined();
    expect(rows[0].printedFactor).toBeUndefined();
    expect(summary.sourceChecks?.numberFormat).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("without unit evidence the factor is 1, never the 1000 alias", () => {
    // english 6.6 × 1000 equals european 6600 × 1: only unit evidence decides.
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6600 })],
      2021,
      { source: { text: undetected, kind: "document" } },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6.6,
      printedFactor: 1,
      numberCheck: true,
    });
    const [european] = applyReadings(
      rows,
      { units: {}, numberFormat: "english" },
      { units: {}, numberFormat: "european" },
    );
    expect(european.totalCO2e).toBe(6600);
  });

  it("an ambiguous number on a kt page takes the kt factor", () => {
    const text = "Table 3: Emissions (kt CO2e)\n| Natural gas | 6.600 |\n";
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6600, unit: "t" })],
      2021,
      { source: { text, kind: "page" } },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6600,
      printedFactor: 1000,
      numberCheck: true,
    });
    const [european] = applyReadings(
      rows,
      { units: {}, numberFormat: "english" },
      { units: {}, numberFormat: "european" },
    );
    expect(european.totalCO2e).toBe(6_600_000);
  });

  it("a number the model left in kt takes the unit multiplier", () => {
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6, unit: "kt" })],
      2021,
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 6600, printedFactor: 1000 });
  });

  it("page selection fallback keeps the checked fields", () => {
    const european = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6 })],
      2021,
      {
        source: { text: undetected, kind: "page" },
        sourceMetadata: countryDefault("european"),
        deferYearAssumption: true,
      },
    );
    const detected = finalizeExtractedRows(
      [
        lineItem({
          category: "Diesel",
          gpcRefNo: "II.1.1",
          sector: "Transportation",
          subsector: "On Road Transportation",
          totalCO2eText: "1.500",
          totalCO2e: 1500,
        }),
      ],
      2021,
      {
        source: { text: "1.234.567 2.345.678 1.500\n", kind: "page" },
        deferYearAssumption: true,
      },
    );
    const selected = selectReconciledPages(
      [
        { page: 1, result: european },
        { page: 2, result: detected },
      ],
      2021,
    );
    expect(selected.summary.pageSelection).toBe("fallback");
    expect(selected.rows.map((r) => r.totalCO2e)).toEqual([6600, 1500]);
    expect(selected.rows[0]).toMatchObject({
      numberCheck: true,
      printedFactor: 1,
    });
    expect(selected.rows[1].numberCheck).toBeUndefined();
    expect(selected.rows[1].printedFactor).toBe(1);
  });

  it("keeps the gases of an ambiguous row to restore them", () => {
    // The model read 6.600 as 6.6 (english); the document reads european.
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6, co2: 6, ch4: 0.6 })],
      2021,
      {
        source: { text: undetected, kind: "document" },
        sourceMetadata: countryDefault("european"),
      },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6600,
      co2: null,
      ch4: null,
      extractedGases: {
        co2: 6,
        ch4: 0.6,
        numberFormat: "english",
        unit: "t",
      },
    });
    const [english] = applyReadings(
      rows,
      { units: {}, numberFormat: "european" },
      { units: {}, numberFormat: "english" },
    );
    expect(english).toMatchObject({ totalCO2e: 6.6, co2: 6, ch4: 0.6 });
  });

  it("no extracted gases on a row that is not ambiguous", () => {
    const { rows } = finalizeExtractedRows(
      [lineItem({ totalCO2eText: "6.600", totalCO2e: 6600, co2: 6600 })],
      2021,
      {
        source: {
          text: "1.234.567 1.234.567 1.234.567\n" + undetected,
          kind: "document",
        },
      },
    );
    expect(rows[0].numberCheck).toBeUndefined();
    expect(rows[0].co2).toBe(6600);
    expect(rows[0].extractedGases).toBeUndefined();
  });

  it("an ambiguous total gets the same fields as its rows", () => {
    const { summary } = finalizeExtractedRows(
      [
        lineItem({ totalCO2eText: "6.600", totalCO2e: 6.6 }),
        total("Total", 6.6, { totalCO2eText: "6.600" }),
      ],
      2021,
      { sourceMetadata: countryDefault("european") },
    );
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 6600,
      totalCO2eText: "6.600",
      numberCheck: true,
      printedFactor: 1,
    });
  });
});

describe("total check", () => {
  const text =
    "| I.1.1 | Natural gas | 600,000 |\n" +
    "| I.1.2 | Electricity | 300,000 |\n" +
    "| BASIC | 900,000 |\n| BASIC+ | 1,000,000 |\n| Total 2019 | 950,000 |\n";
  const rows = [
    lineItem({ totalCO2e: 600000 }),
    lineItem({
      category: "Electricity",
      scope: "2",
      gpcRefNo: "I.1.2",
      totalCO2e: 300000,
    }),
    total("BASIC", 900000, { source: "Table 2", page: 4 }),
    total("BASIC+", 1000000),
    total("Total 2019", 950000, { year: 2019 }),
    total("Total GHG emissions", 920000),
  ];

  it("printed, year-matched grand totals become candidates", () => {
    const { summary } = finalizeExtractedRows(rows, 2021, {
      source: { text, kind: "document" },
      inventoryType: "gpc_basic",
    });
    const check = summary.sourceChecks?.total;
    expect(check?.candidates.map((c) => c.label)).toEqual(["BASIC", "BASIC+"]);
    expect(check?.candidates[0]).toMatchObject({
      value: 900000,
      source: "Table 2",
      page: 4,
    });
    expect(check?.status).toBe("pending");
    expect(check?.selected).toBeNull();
    expect(check?.suggested).toBe(0);
    expect(check?.suggested).toBe(
      selectLevelTotal(check?.candidates ?? [], "gpc_basic"),
    );
  });

  it("suggests the BASIC+ total for a BASIC+ inventory", () => {
    const { summary } = finalizeExtractedRows(rows, 2021, {
      source: { text, kind: "document" },
      inventoryType: "gpc_basic_plus",
    });
    expect(summary.sourceChecks?.total?.suggested).toBe(1);
  });

  it("the cap keeps the level total when it comes after five others", () => {
    const labels = ["Total A", "Total B", "Total C", "Total D", "Total E"];
    const values = [1_000_000, 1_010_000, 1_020_000, 1_030_000, 1_040_000];
    const many = [
      lineItem({ totalCO2e: 990_000 }),
      ...labels.map((label, i) => total(label, values[i])),
      total("BASIC", 990_000),
    ];
    const printed =
      "| I.1.1 | Natural gas | 990,000 |\n" +
      labels
        .map((label, i) => `| ${label} | ${values[i].toLocaleString("en")} |`)
        .join("\n") +
      "\n| BASIC | 990,000 |\n";
    const { summary } = finalizeExtractedRows(many, 2021, {
      source: { text: printed, kind: "document" },
      inventoryType: "gpc_basic",
    });
    const check = summary.sourceChecks?.total;
    expect(check?.candidates).toHaveLength(5);
    expect(check?.candidates.map((c) => c.label)).toEqual([
      "Total A",
      "Total B",
      "Total C",
      "Total D",
      "BASIC",
    ]);
    expect(check?.suggested).toBe(4);
  });

  it("no candidates: empty list and no suggestion", () => {
    const { summary } = finalizeExtractedRows([lineItem()], 2021);
    expect(summary.sourceChecks?.total).toEqual({
      status: "pending",
      candidates: [],
      selected: null,
      suggested: null,
    });
    expect(summary.sourceChecks?.unit).toBeUndefined();
    expect(summary.sourceChecks?.numberFormat).toBeUndefined();
  });

  it("no rows: no checks", () => {
    const { rows: kept, summary } = finalizeExtractedRows(
      [total("Total", 900000)],
      2021,
    );
    expect(kept).toEqual([]);
    expect(summary.sourceChecks).toBeUndefined();
  });
});

const manyNumbers = (style: "european" | "english", tag: string) => {
  const sep = style === "european" ? "." : ",";
  const nums = [
    `1${sep}234${sep}567`,
    `2${sep}345${sep}678`,
    `3${sep}456${sep}789`,
    `4${sep}567${sep}890`,
    `5${sep}678${sep}901`,
    `6${sep}789${sep}012`,
    `7${sep}890${sep}123`,
    `8${sep}901${sep}234`,
  ];
  return `${tag}\n${nums.join(" ")}\n`;
};

const onePage = (n: number, body: string) => `<!-- page: ${n} -->\n${body}`;

/** The model answers by the PAGE_n tag it finds in the user message. */
function mockByPage(byPage: Record<number, Record<string, unknown>[]>) {
  complete.mockImplementation(async (args: unknown) => {
    const messages = (args as { messages: { content: string }[] }).messages;
    const user = messages[messages.length - 1].content;
    const marker = /PAGE_(\d+)/.exec(user);
    const rows = marker ? (byPage[Number(marker[1])] ?? []) : [];
    return { content: JSON.stringify({ rows }) };
  });
}

const modelRow = (
  value: string | number,
  over: Record<string, unknown> = {},
) => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: "Natural gas",
  scope: "1",
  gpcRefNo: "I.1.1",
  totalCO2e: value,
  rowType: "line_item",
  ...over,
});

const prompts = () =>
  complete.mock.calls
    .map((call) => {
      const messages = (call[0] as { messages: { content: string }[] })
        .messages;
      return messages.map((m) => m.content).join("\n");
    })
    .join("\n");

describe("extraction from a document", () => {
  it("asks the model for the printed text and keeps MT", async () => {
    mockByPage({
      1: [
        modelRow(252514, {
          unit: "MT",
          totalCO2eText: "252,514",
          source: "Table 4",
        }),
        {
          year: 2021,
          category: "Total",
          totalCO2e: 252514,
          unit: "MT",
          rowType: "total",
        },
      ],
    });
    const text =
      onePage(1, manyNumbers("english", "PAGE_1") + "| 252,514 |\n") +
      onePage(2, "x\n");
    const { rows, summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
      inventoryType: "gpc_basic",
    });
    expect(prompts()).toContain("totalCO2eText");
    expect(prompts()).toContain('set unit to "MT"');
    expect(rows[0]).toMatchObject({
      totalCO2e: 252514,
      totalCO2eText: "252,514",
      printedFactor: 1,
      unitCheck: "MT",
      page: 1,
    });
    expect(summary.sourceChecks?.unit?.evidence).toEqual({
      unitText: "MT",
      sources: ["Table 4"],
      pages: [1],
      example: { label: "Natural gas", text: "252,514" },
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(summary.sourceChecks?.total?.candidates.map((c) => c.label)).toEqual(
      ["Total"],
    );
    expect(summary.sourceChecks?.total?.suggested).toBe(0);
  });
});

describe("document style decides the number check", () => {
  it("a page with only an ambiguous number raises no check in a european document", async () => {
    mockByPage({
      2: [
        modelRow(6600, { totalCO2eText: "6.600" }),
        modelRow(1234, {
          category: "Electricity",
          scope: "2",
          gpcRefNo: "I.1.2",
          totalCO2eText: "1234",
        }),
        { year: 2021, category: "Total", totalCO2e: 7834, rowType: "total" },
      ],
    });
    const text =
      onePage(1, "Summary\n1.234.567 2.345.678 3.456.789\n") +
      onePage(
        2,
        "PAGE_2\n100 200 300 400 500 600 700 800\n" +
          "| I.1.1 | 6.600 |\n| I.1.2 | 1234 |\n| Total | 7834 |\n",
      );
    const { rows, summary } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(summary.pageSelection).toBe("reconciled");
    expect(rows[0]).toMatchObject({ totalCO2e: 6600, printedFactor: 1 });
    expect(rows[0].numberCheck).toBeUndefined();
    expect(summary.sourceChecks?.numberFormat).toBeUndefined();
  });
});

describe("number style from the country default", () => {
  const page = (style: "european" | "english") =>
    onePage(1, manyNumbers(style, "PAGE_1")) + onePage(2, "intro\n");

  it("country default yields to detection", async () => {
    mockByPage({ 1: [modelRow("1.500")] });
    const result = await extractInventoryFromDocument(page("european"), {
      targetYear: 2021,
      sourceMetadata: countryDefault("english"),
    });
    expect(result.rows[0].totalCO2e).toBe(1500);
    expect(prompts()).not.toContain('use "." as the decimal separator');
  });

  it("country default decides when the document has no detectable style", async () => {
    mockByPage({ 1: [modelRow("1.500")] });
    const text = onePage(1, "PAGE_1\n| I.1.1 | 1.500 |\n") + onePage(2, "x\n");
    const result = await extractInventoryFromDocument(text, {
      targetYear: 2021,
      sourceMetadata: countryDefault("european"),
    });
    expect(result.rows[0].totalCO2e).toBe(1500);
    expect(prompts()).toContain('use "," as the decimal separator');
  });
});
