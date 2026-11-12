/**
 * CC-1162: a document without a scope column must map grid electricity to I.6.2,
 * T&D losses to I.6.3 and refrigerants to IV.2 on every run, however the model
 * varies the reference and scope it returns. A T&D row the model puts on a
 * reference left out of the total is held for review, never silently dropped.
 * The LLM and the database are mocked; the fixture is synthetic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
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

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      Scope: {
        findAll: async () => [
          { scopeId: "scope-1-id", scopeName: "1" },
          { scopeId: "scope-2-id", scopeName: "2" },
          { scopeId: "scope-3-id", scopeName: "3" },
        ],
      },
    },
  },
}));

const { extractInventoryFromDocument, sumImported } =
  await import("@/backend/InventoryExtractionService");
const { default: ECRFImportService } =
  await import("@/backend/ECRFImportService");
const { previewImportRows } = await import("@/backend/ImportRowPreviewService");
const { reconcileExtraction } = await import("@/util/GHGI/extraction-summary");

const fixtureText = readFileSync(
  path.join(process.cwd(), "tests/fixtures/masterton-no-scope-excerpt.md"),
  "utf8",
);

const STATIONARY = "Stationary Energy";
const IPPU = "Industrial Processes And Product Uses Ippu";
const NON_SPECIFIED = "Non-Specified Sources";
const ENERGY_INDUSTRIES = "Energy Industries";
const PRODUCT_USE = "Product Use";

type Variation = { gpcRefNo: string | null; scope: string | null };

const lineItem = (
  category: string,
  totalCO2e: number,
  sector: string,
  subsector: string,
  extra: Record<string, unknown>,
) => ({
  year: 2022,
  sector,
  subsector,
  category,
  totalCO2e,
  unit: "t",
  rowType: "line_item",
  refSource: "inferred",
  source: "Masterton excerpt",
  ...extra,
});

const totalRow = {
  year: 2022,
  sector: "Total",
  subsector: "Total",
  category: "Total",
  totalCO2e: 29422,
  unit: "t",
  rowType: "total",
  gpcRefNo: null,
  scope: null,
  source: "Masterton excerpt",
};

/** Queues one model response: the four line items and the document total. */
function mockRun(
  grid: Variation,
  td: Variation,
  refrigerants: Variation,
  tdClass: Record<string, unknown> = { activityClass: "td_losses" },
  extraRows: Record<string, unknown>[] = [],
) {
  const energySubsector = (v: Variation) =>
    v.gpcRefNo?.startsWith("I.4.") ? ENERGY_INDUSTRIES : NON_SPECIFIED;
  const rows = [
    lineItem(
      "Electricity Consumption (grid)",
      16119,
      STATIONARY,
      energySubsector(grid),
      { activityClass: "grid_energy", ...grid },
    ),
    lineItem("Electricity T&D Losses", 1710, STATIONARY, energySubsector(td), {
      ...tdClass,
      ...td,
    }),
    lineItem("Natural gas", 4200, STATIONARY, "Residential Buildings", {
      activityClass: "fuel_combustion",
      gpcRefNo: "I.1.1",
      scope: "1",
    }),
    lineItem("Refrigerants and Air Conditioning", 7393, IPPU, PRODUCT_USE, {
      activityClass: "product_use",
      ...refrigerants,
    }),
  ];
  complete.mockResolvedValueOnce({
    content: JSON.stringify({ rows: [...rows, ...extraRows, totalRow] }),
  });
}

async function runPipeline() {
  const { rows, summary } = await extractInventoryFromDocument(fixtureText, {
    targetYear: 2022,
  });
  const lineItems = rows.filter((row) => row.rowType !== "total");
  const result = await ECRFImportService.fromExtractedRows(lineItems);
  // The import builder flags every PDF result so held rows are reviewed.
  result.requiresReferenceReview = true;
  const preview = await previewImportRows(result, undefined);
  return { rows: lineItems, summary, result, preview };
}

const byCategory = <T extends { category?: string | null }>(
  rows: T[],
  category: string,
) => rows.find((row) => row.category === category)!;

beforeEach(() => {
  complete.mockReset();
  jest
    .spyOn(ECRFImportService, "lookupGPCReference")
    .mockImplementation(async (gpcRefNo: string) => ({
      sectorId: "sector",
      subsectorId: "subsector",
      subcategoryId: `sub-${gpcRefNo}`,
      // Scope as the catalogue has it: I.x.2 is scope 2, I.x.3 is scope 3.
      scopeId: /^I\.\d\.2$/.test(gpcRefNo)
        ? "scope-2-id"
        : /^I\.\d\.3$/.test(gpcRefNo)
          ? "scope-3-id"
          : "scope-1-id",
    }));
});

describe("Masterton without a scope column", () => {
  const unstable: [Variation, Variation, Variation][] = [
    [
      { gpcRefNo: "I.6.1", scope: "1" },
      { gpcRefNo: "I.6.1", scope: "1" },
      { gpcRefNo: "IV.1", scope: "1" },
    ],
    [
      { gpcRefNo: "I.6.2", scope: "2" },
      { gpcRefNo: "I.6.2", scope: "2" },
      { gpcRefNo: "IV.2", scope: "1" },
    ],
    [
      { gpcRefNo: "I.4.2", scope: null },
      { gpcRefNo: "I.4.4", scope: null },
      { gpcRefNo: "IV.1", scope: null },
    ],
    [
      { gpcRefNo: null, scope: null },
      { gpcRefNo: "I.4.3", scope: null },
      { gpcRefNo: null, scope: null },
    ],
    [
      { gpcRefNo: "I.6.1", scope: null },
      { gpcRefNo: null, scope: null },
      { gpcRefNo: "IV.1", scope: null },
    ],
  ];

  it.each(unstable.map((variation, i) => [i + 1, variation] as const))(
    "maps grid to I.6.2, T&D to I.6.3 and refrigerants to IV.2 on run %i",
    async (_run, [grid, td, refrigerants]) => {
      mockRun(grid, td, refrigerants);

      const { rows, summary, result, preview } = await runPipeline();

      expect(byCategory(rows, "Electricity Consumption (grid)").gpcRefNo).toBe(
        "I.6.2",
      );
      expect(byCategory(rows, "Electricity T&D Losses").gpcRefNo).toBe("I.6.3");
      expect(
        byCategory(rows, "Refrigerants and Air Conditioning").gpcRefNo,
      ).toBe("IV.2");
      expect(sumImported(rows)).toBe(29422);
      // The stored reconciliation sum is the one after the rules.
      expect(summary.importedSum).toBe(29422);
      expect(reconcileExtraction(summary)?.mismatch).toBe(false);
      expect(result.errors).toEqual([]);
      expect(preview.reviewRows).toEqual([]);
      expect(preview.pendingRows).toBe(0);
    },
  );

  const wrongClass: [string, Record<string, unknown>][] = [
    ["a missing class", {}],
    ["class other", { activityClass: "other" }],
    ["class grid_supply", { activityClass: "grid_supply" }],
  ];

  it.each(wrongClass)(
    "holds a T&D row on I.4.4 with %s for review",
    async (_label, tdClass) => {
      mockRun(
        { gpcRefNo: "I.6.2", scope: "2" },
        { gpcRefNo: "I.4.4", scope: null },
        { gpcRefNo: "IV.2", scope: "1" },
        tdClass,
      );

      const { preview } = await runPipeline();

      const held = preview.reviewRows.filter(
        (row) => row.category === "Electricity T&D Losses",
      );
      expect(held).toHaveLength(1);
      expect(held[0].issue).toBe("excluded-reference-unconfirmed");
      expect(preview.pendingRows).toBe(1);
    },
  );

  it("reconciles once T&D losses move off I.4.4", async () => {
    mockRun(
      { gpcRefNo: "I.6.2", scope: "2" },
      { gpcRefNo: "I.4.4", scope: null },
      { gpcRefNo: "IV.2", scope: "1" },
    );

    const { rows, summary } = await runPipeline();

    expect(byCategory(rows, "Electricity T&D Losses").gpcRefNo).toBe("I.6.3");
    expect(summary.importedSum).toBe(29422);
    expect(reconcileExtraction(summary)).toMatchObject({
      reportedTotal: 29422,
      mismatch: false,
    });
  });

  it("reconciles once grid supply moves onto I.4.4", async () => {
    mockRun(
      { gpcRefNo: "I.6.2", scope: "2" },
      { gpcRefNo: "I.6.3", scope: "3" },
      { gpcRefNo: "IV.2", scope: "1" },
      undefined,
      [
        lineItem(
          "Electricity supplied to grid",
          5000,
          STATIONARY,
          ENERGY_INDUSTRIES,
          {
            activityClass: "grid_supply",
            gpcRefNo: "I.4.1",
            scope: "1",
          },
        ),
      ],
    );

    const { rows, summary } = await runPipeline();

    expect(byCategory(rows, "Electricity supplied to grid").gpcRefNo).toBe(
      "I.4.4",
    );
    expect(summary.importedSum).toBe(29422);
    expect(reconcileExtraction(summary)?.mismatch).toBe(false);
  });
});

describe("grid scope the model already gave", () => {
  const gridRow = <T extends { gpcRefNo?: string | null }>(rows: T[]) =>
    rows.filter((row) => row.gpcRefNo === "I.6.2");

  it.each(["2", "Scope 2"])(
    "keeps model scope %s on I.6.2 without marking it inferred",
    async (scope) => {
      mockRun(
        { gpcRefNo: "I.6.1", scope },
        { gpcRefNo: "I.6.3", scope: "3" },
        { gpcRefNo: "IV.2", scope: "1" },
      );

      const { rows, preview } = await runPipeline();

      const [grid] = gridRow(rows);
      expect(grid.scope).toBe("2");
      expect(grid.scopeSource).not.toBe("inferred");
      expect(gridRow(preview.inferredScopeRows ?? [])).toEqual([]);
      expect(preview.reviewRows).toEqual([]);
    },
  );

  it("lists a changed model scope with the original scope", async () => {
    mockRun(
      { gpcRefNo: "I.6.1", scope: "1" },
      { gpcRefNo: "I.6.3", scope: "3" },
      { gpcRefNo: "IV.2", scope: "1" },
    );

    const { preview } = await runPipeline();

    expect(gridRow(preview.inferredScopeRows ?? [])).toEqual([
      expect.objectContaining({ scope: "2", originalScope: "1" }),
    ]);
  });

  it("lists a missing model scope without an original scope", async () => {
    mockRun(
      { gpcRefNo: "I.6.1", scope: null },
      { gpcRefNo: "I.6.3", scope: "3" },
      { gpcRefNo: "IV.2", scope: "1" },
    );

    const { preview } = await runPipeline();

    expect(gridRow(preview.inferredScopeRows ?? [])).toEqual([
      expect.objectContaining({ scope: "2", originalScope: null }),
    ]);
  });
});
