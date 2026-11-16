/**
 * CC-1233: Long Beach prints "2021 Emissions (Mt CO2e)" and defines "MT: metric
 * tons" in its glossary. With such a glossary "Mt" is no megatonne: its rows go
 * to the "Check units" card, read as metric tonnes by default. Without one, "Mt"
 * still converts by 1,000,000. The LLM is mocked.
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

const warn = jest.fn();

jest.unstable_mockModule("@/services/logger", () => ({
  logger: {
    warn,
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const { extractInventoryFromDocument, finalizeExtractedRows } =
  await import("@/backend/InventoryExtractionService");
const { optionTotals, readingsOf, DOC_UNIT_GROUP } =
  await import("@/util/GHGI/source-checks");

beforeEach(() => {
  complete.mockReset();
  warn.mockReset();
});

const LONG_BEACH_TOTAL = 3_250_886;

/** Printed values in the "(Mt CO2e)" column; they sum to LONG_BEACH_TOTAL. */
const PRINTED = [
  {
    sector: "Stationary Energy",
    ref: "I.1.1",
    value: 1_500_000,
    text: "1,500,000",
  },
  {
    sector: "Transportation",
    ref: "II.1.1",
    value: 1_250_000,
    text: "1,250,000",
  },
  { sector: "Waste", ref: "III.1.1", value: 500_886, text: "500,886" },
];

const TABLE_PAGE =
  "<!-- page: 1 -->\nPAGE_1\nTable 1: Long Beach community inventory\n" +
  "| Sector | 2021 Emissions (Mt CO2e) |\n|---|---|\n" +
  PRINTED.map((p) => `| ${p.sector} | ${p.text} |`).join("\n") +
  "\n| Total | 3,250,886 |\n" +
  "Population 451,307; area 13,140 ha; 2,345,678 vehicle miles; 1,234,567 therms.\n";

const GLOSSARY_PAGE =
  "<!-- page: 2 -->\nGlossary\nCO2e: carbon dioxide equivalent\nMT: metric tons\n";

const OTHER_PAGE = "<!-- page: 2 -->\nAbout this report\n";

/** The model answers the table page with `rows`, any other page with none. */
function mockTablePage(rows: Record<string, unknown>[]) {
  complete.mockImplementation(async (args: unknown) => {
    const messages = (args as { messages: { content: string }[] }).messages;
    const user = messages[messages.length - 1].content;
    return {
      content: JSON.stringify({ rows: user.includes("PAGE_1") ? rows : [] }),
    };
  });
}

/** Rows as the model answers them, each value times `factor`, in `unit`. */
function modelRows(unit: string, factor: number) {
  return [
    ...PRINTED.map((p) => ({
      year: 2021,
      sector: p.sector,
      category: p.sector,
      scope: "1",
      gpcRefNo: p.ref,
      totalCO2e: p.value * factor,
      co2: p.value * factor * 0.9,
      ch4: p.value * factor * 0.06,
      n2o: p.value * factor * 0.04,
      totalCO2eText: p.text,
      unit,
      rowType: "line_item",
    })),
    {
      year: 2021,
      category: "Total",
      totalCO2e: LONG_BEACH_TOTAL * factor,
      totalCO2eText: "3,250,886",
      unit,
      rowType: "total",
    },
  ];
}

const options = { targetYear: 2021, inventoryType: "gpc_basic" };

describe("Mt with an MT glossary", () => {
  it.each([
    ["model kept the unit", "Mt", 1],
    ["model converted", "t", 1_000_000],
  ])(
    "Long Beach-like: Mt header plus MT glossary goes to the card, tonnes by default (%s)",
    async (_label, unit, factor) => {
      mockTablePage(modelRows(unit, factor));
      const { rows, summary } = await extractInventoryFromDocument(
        TABLE_PAGE + GLOSSARY_PAGE,
        options,
      );
      expect(rows).toHaveLength(3);
      for (const [i, row] of rows.entries()) {
        expect(row).toMatchObject({
          totalCO2e: PRINTED[i].value,
          co2: PRINTED[i].value * 0.9,
          ch4: PRINTED[i].value * 0.06,
          n2o: PRINTED[i].value * 0.04,
          totalCO2eText: PRINTED[i].text,
          printedFactor: 1,
          unitCheck: "MT",
        });
        expect(row.valueCheck).toBeUndefined();
      }
      expect(summary.pageSelection).toBe("reconciled");
      expect(summary.importedSum).toBe(LONG_BEACH_TOTAL);
      expect(summary.reportedTotals[0]).toMatchObject({
        value: LONG_BEACH_TOTAL,
        unitCheck: "MT",
      });
      const checks = summary.sourceChecks!;
      expect(checks.unit).toMatchObject({ status: "pending", reading: "t" });
      expect(checks.unit?.evidence.pages).toEqual([1]);
      // The card quotes the unit as Long Beach prints it.
      expect(checks.unit?.evidence.unitText).toBe("Mt");
      // The card's options: tonnes (the stored sum) or megatonnes.
      expect(
        optionTotals(rows, readingsOf(checks), { unitGroup: DOC_UNIT_GROUP }),
      ).toEqual([
        { reading: "t", total: LONG_BEACH_TOTAL },
        { reading: "Mt", total: LONG_BEACH_TOTAL * 1_000_000 },
      ]);
    },
  );

  it.each([
    ["unscaled", 1],
    ["scaled by the model", 1_000_000],
  ])(
    "unit-less rows under an Mt caption go to the MT card, never missing (R27, %s)",
    async (_label, factor) => {
      mockTablePage(
        modelRows("", factor).map((row) => ({ ...row, unit: null })),
      );
      const { rows, summary } = await extractInventoryFromDocument(
        TABLE_PAGE + GLOSSARY_PAGE,
        options,
      );
      expect(rows).toHaveLength(3);
      for (const [i, row] of rows.entries()) {
        expect(row).toMatchObject({
          totalCO2e: PRINTED[i].value,
          totalCO2eText: PRINTED[i].text,
          unitCheck: "MT",
          printedUnit: "Mt",
        });
        expect(row.unitHint).toBeUndefined();
      }
      expect(summary.importedSum).toBe(LONG_BEACH_TOTAL);
      expect(summary.reportedTotals[0]).toMatchObject({
        value: LONG_BEACH_TOTAL,
        unitCheck: "MT",
      });
      expect(summary.sourceChecks?.unit).toMatchObject({
        status: "pending",
        reading: "t",
      });
      expect(summary.sourceChecks?.unitGroups ?? []).toEqual([]);
    },
  );

  it("chunk path (no pages): rows the model scaled from Mt are restored to the card (R28)", async () => {
    mockTablePage(modelRows("t", 1_000_000));
    const text =
      TABLE_PAGE.replace("<!-- page: 1 -->\n", "") +
      GLOSSARY_PAGE.replace("<!-- page: 2 -->\n", "");
    const { rows, summary } = await extractInventoryFromDocument(text, options);
    expect(rows.map((r) => r.totalCO2e)).toEqual(PRINTED.map((p) => p.value));
    for (const row of rows) {
      expect(row).toMatchObject({
        unitCheck: "MT",
        printedUnit: "Mt",
        printedFactor: 1,
      });
    }
    expect(summary.importedSum).toBe(LONG_BEACH_TOTAL);
    expect(summary.sourceChecks?.unit?.reading).toBe("t");
  });

  it("chunk path without an Mt caption keeps the model's conversion", async () => {
    mockTablePage(modelRows("t", 1_000_000));
    const text =
      TABLE_PAGE.replace("<!-- page: 1 -->\n", "").replace(
        "(Mt CO2e)",
        "(million metric tons CO2e)",
      ) + GLOSSARY_PAGE.replace("<!-- page: 2 -->\n", "");
    const { rows } = await extractInventoryFromDocument(text, options);
    expect(rows.map((r) => r.totalCO2e)).toEqual(
      PRINTED.map((p) => p.value * 1_000_000),
    );
    expect(rows.some((r) => r.unitCheck != null)).toBe(false);
  });

  it("chunk path (no pages): Mt rows go to the card too", async () => {
    mockTablePage(modelRows("Mt", 1));
    const text =
      TABLE_PAGE.replace("<!-- page: 1 -->\n", "") +
      GLOSSARY_PAGE.replace("<!-- page: 2 -->\n", "");
    const { rows, summary } = await extractInventoryFromDocument(text, options);
    expect(rows.map((r) => r.totalCO2e)).toEqual(PRINTED.map((p) => p.value));
    expect(rows.every((r) => r.unitCheck === "MT")).toBe(true);
    expect(summary.importedSum).toBe(LONG_BEACH_TOTAL);
    expect(summary.sourceChecks?.unit?.reading).toBe("t");
  });
});

describe("Mt without a glossary", () => {
  it("national inventory with Mt and no glossary converts by 10^6", async () => {
    mockTablePage(modelRows("Mt", 1));
    const { rows, summary } = await extractInventoryFromDocument(
      TABLE_PAGE + OTHER_PAGE,
      options,
    );
    expect(rows.map((r) => r.totalCO2e)).toEqual(
      PRINTED.map((p) => p.value * 1_000_000),
    );
    expect(rows.some((r) => r.unitCheck != null)).toBe(false);
    expect(summary.importedSum).toBe(LONG_BEACH_TOTAL * 1_000_000);
    expect(summary.sourceChecks?.unit).toBeUndefined();
  });

  it("a model-converted row stays converted", async () => {
    mockTablePage(modelRows("t", 1_000_000));
    const { rows, summary } = await extractInventoryFromDocument(
      TABLE_PAGE + OTHER_PAGE,
      options,
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 1_500_000 * 1_000_000,
      printedFactor: 1_000_000,
    });
    expect(rows[0].unitCheck).toBeUndefined();
    expect(summary.sourceChecks?.unit).toBeUndefined();
  });
});

describe("Mt restore needs an Mt caption", () => {
  const MILLION_PAGE = TABLE_PAGE.replace(
    "(Mt CO2e)",
    "(million metric tons CO2e)",
  );

  it("MT glossary with a million metric tons caption keeps the conversion", async () => {
    mockTablePage(modelRows("t", 1_000_000));
    const { rows, summary } = await extractInventoryFromDocument(
      MILLION_PAGE + GLOSSARY_PAGE,
      options,
    );
    expect(rows.map((r) => r.totalCO2e)).toEqual(
      PRINTED.map((p) => p.value * 1_000_000),
    );
    expect(rows.every((r) => r.printedFactor === 1_000_000)).toBe(true);
    expect(rows.some((r) => r.unitCheck != null)).toBe(false);
    expect(summary.sourceChecks?.unit).toBeUndefined();
  });

  it("restores ch4, n2o and the extracted gases too", () => {
    const factor = 1_000_000;
    const { rows } = finalizeExtractedRows(
      [
        {
          year: 2021,
          sector: "Stationary Energy",
          subsector: null,
          category: "Natural gas",
          scope: "1",
          gpcRefNo: "I.1.1",
          totalCO2e: 6600 * factor,
          co2: 6000 * factor,
          ch4: 400 * factor,
          n2o: 200 * factor,
          unit: "t",
          rowType: "line_item",
          page: 1,
          totalCO2eText: "6.600",
          printedFactor: factor,
          numberCheck: true,
          extractedGases: {
            co2: 6000 * factor,
            ch4: 400 * factor,
            n2o: 200 * factor,
            numberFormat: "english",
            unit: "t",
          },
        },
      ],
      2021,
      {
        source: {
          text: "| Sector | (Mt CO2e) |\n|---|---|\n| Gas | 6.600 |\n",
          kind: "page",
        },
        mtIsMetricTons: true,
      },
    );
    expect(rows[0]).toMatchObject({
      totalCO2e: 6600,
      co2: 6000,
      ch4: 400,
      n2o: 200,
      printedFactor: 1,
      unitCheck: "MT",
      printedUnit: "Mt",
      extractedGases: {
        co2: 6000,
        ch4: 400,
        n2o: 200,
        numberFormat: "english",
        unit: "t",
      },
    });
    expect(rows[0].valueCheck).toBeUndefined();
  });

  it("a converted row without printed text is kept as extracted and logged", async () => {
    mockTablePage(
      modelRows("t", 1_000_000).map((row) => {
        const { totalCO2eText: _text, ...rest } = row;
        return rest;
      }),
    );
    const { rows } = await extractInventoryFromDocument(
      TABLE_PAGE + GLOSSARY_PAGE,
      options,
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 1_500_000 * 1_000_000 });
    expect(rows[0].unitCheck).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1_500_000 * 1_000_000, page: 1 }),
      "Value looks scaled from Mt in a document defining MT as metric tons; kept as extracted",
    );
  });
});
