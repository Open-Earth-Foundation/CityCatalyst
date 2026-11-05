/**
 * CC-1161: forestry removals missing from a PDF import. The review screen must warn
 * when the selected rows reconcile only to the gross total, or when a removals total
 * has no line items. The LLM is not involved: these tests feed page results straight
 * into the page selection and the review notes.
 *
 * Numbers come from the Masterton 2021/22 report: gross 785,873, forestry removals
 * -811,512, net -25,639 tCO2e.
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete: jest.fn() }),
  LLMError: class LLMError extends Error {},
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));

const { finalizeExtractedRows, selectReconciledPages } =
  await import("@/backend/InventoryExtractionService");
const { extractionReviewNotes, reconciliationTargets } =
  await import("@/util/GHGI/extraction-summary");
type ExtractedRow = import("@/backend/InventoryExtractionService").ExtractedRow;
type ReportedTotal = import("@/util/GHGI/extraction-summary").ReportedTotal;

const GROSS = 785873;
const REMOVALS = -811512;
const NET = GROSS + REMOVALS; // -25639
const AFOLU = "Agriculture, Forestry And Other Land Use";

const row = (
  gpcRefNo: string | null,
  scope: string | null,
  totalCO2e: number | null,
  extra: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: null,
  totalCO2e,
  scope,
  gpcRefNo,
  ...extra,
});

const CITY = { sector: null, subsector: null };

/** A city-wide total row, as the model returns the "Total" lines of the summary page. */
const total = (value: number, category: string): ExtractedRow =>
  row(null, null, value, { ...CITY, rowType: "total", category });

/** The forestry removals total the model returns without any line item. */
const forestryTotal = (): ExtractedRow =>
  row(null, null, REMOVALS, {
    sector: "Forestry",
    subsector: "Forestry",
    category: "Forestry removals",
    rowType: "total",
  });

const sectorRow = (
  sector: string,
  category: string,
  value: number,
): ExtractedRow =>
  row(null, null, value, { sector, subsector: sector, category });

/** Four sector pages that add up to the gross total. */
const sectorPages = () => [
  pageOf(12, [sectorRow("Stationary Energy", "Electricity", 500000)]),
  pageOf(13, [sectorRow("Transportation", "Diesel", 150000)]),
  pageOf(14, [sectorRow("Agriculture", "Enteric", 100000)]),
  pageOf(15, [sectorRow("Waste", "Landfill", GROSS - 750000)]),
];

const pageOf = (page: number, rows: ExtractedRow[]) => ({
  page,
  result: finalizeExtractedRows(rows, 2021, { deferYearAssumption: true }),
});

const summaryPage = (...totals: ExtractedRow[]) => pageOf(5, totals);

describe("CC-1161 removals missing from the import", () => {
  it("1. warns when forestry is only a total row without line items", () => {
    const result = selectReconciledPages(
      [
        summaryPage(
          total(GROSS, "Total Emissions (gross)"),
          total(NET, "Total Net Emissions (including Forestry)"),
        ),
        ...sectorPages(),
        pageOf(16, [forestryTotal()]),
      ],
      2021,
    );
    expect(result.summary.importedSum).toBe(GROSS);
    expect(result.summary.orphanRemovals).toEqual([REMOVALS]);
    // Gross-only (A) and orphan total (B) both hold: one warning, the specific one.
    expect(extractionReviewNotes(result.summary).removalsWarning).toEqual({
      kind: "orphan",
      removals: REMOVALS,
      net: NET,
    });
    // The "adds up to the total the document reports" note would contradict it.
    expect(extractionReviewNotes(result.summary).reconciledPages).toEqual([]);
  });

  it("2. warns when forestry is missing entirely but the net total is reported", () => {
    const result = selectReconciledPages(
      [
        summaryPage(
          total(GROSS, "Total Emissions (gross)"),
          total(NET, "Total Net Emissions (including Forestry)"),
        ),
        ...sectorPages(),
      ],
      2021,
    );
    expect(result.summary.importedSum).toBe(GROSS);
    expect(result.summary.orphanRemovals ?? []).toEqual([]);
    expect(extractionReviewNotes(result.summary).removalsWarning).toEqual({
      kind: "gross-only",
      net: NET,
    });
  });

  it("3. imports the net total, without a warning, when forestry has line items", () => {
    const result = selectReconciledPages(
      [
        summaryPage(
          total(GROSS, "Total Emissions (gross)"),
          total(NET, "Total Net Emissions (including Forestry)"),
        ),
        ...sectorPages(),
        pageOf(16, [
          row("V.2.1", "1", REMOVALS, {
            sector: "Agriculture, Forestry And Other Land Use",
            subsector: "Land",
            category: "Forest land",
          }),
          forestryTotal(),
        ]),
      ],
      2021,
    );
    expect(result.summary.pageSelection).toBe("reconciled");
    expect(result.summary.selectedPages).toEqual([12, 13, 14, 15, 16]);
    expect(result.summary.importedSum).toBe(NET);
    expect(result.summary.orphanRemovals ?? []).toEqual([]);
    expect(extractionReviewNotes(result.summary).removalsWarning).toBeNull();
    expect(extractionReviewNotes(result.summary).reconciledPages).toEqual([
      12, 13, 14, 15, 16,
    ]);
  });

  it("4. does not warn when the document reports no net total", () => {
    const result = selectReconciledPages(
      [summaryPage(total(GROSS, "Total Emissions")), ...sectorPages()],
      2021,
    );
    expect(result.summary.importedSum).toBe(GROSS);
    expect(extractionReviewNotes(result.summary).removalsWarning).toBeNull();
  });

  const netSummary = () =>
    summaryPage(
      total(GROSS, "Total Emissions (gross)"),
      total(NET, "Total Net Emissions (including Forestry)"),
    );

  it("6. inside one tier, the run that reaches the net total beats the run that reaches only the gross", () => {
    const result = selectReconciledPages(
      [
        netSummary(),
        // A GPC table, six rows with scope and reference, that adds up to the gross.
        pageOf(12, [
          row("I.1.1", "1", 300000),
          row("I.1.2", "2", 100000),
          row("I.2.1", "1", 100000),
        ]),
        pageOf(13, [
          row("I.3.1", "1", 100000),
          row("I.4.1", "1", 100000),
          row("III.1.1", "1", GROSS - 700000),
        ]),
        // The same report by sector, five GPC rows, forestry V.2 included: the net.
        pageOf(30, [
          row("I.1.1", "1", 500000, { sector: "Stationary Energy" }),
        ]),
        pageOf(31, [row("II.1.1", "1", 150000, { sector: "Transportation" })]),
        pageOf(32, [row("V.1", "1", 100000, { sector: "Agriculture" })]),
        pageOf(33, [row("III.1.1", "1", GROSS - 750000, { sector: "Waste" })]),
        pageOf(34, [row("V.2.1", "1", REMOVALS, { sector: "Forestry" })]),
      ],
      2021,
    );
    // The gross run has more GPC rows; without the net preference it would win.
    expect(result.summary.selectedPages).toEqual([30, 31, 32, 33, 34]);
    expect(result.summary.importedSum).toBe(NET);
    expect(extractionReviewNotes(result.summary).removalsWarning).toBeNull();
  });

  it("7. a run with GPC rows still ranks before a run without them that reaches the net", () => {
    const result = selectReconciledPages(
      [
        netSummary(),
        pageOf(12, [row("I.1.1", "1", 500000)]),
        pageOf(13, [row("I.1.2", "2", GROSS - 500000)]),
        pageOf(30, [sectorRow("Stationary Energy", "Electricity", 500000)]),
        pageOf(31, [sectorRow("Transportation", "Diesel", 150000)]),
        pageOf(32, [sectorRow("Agriculture", "Enteric", 100000)]),
        pageOf(33, [sectorRow("Waste", "Landfill", GROSS - 750000)]),
        pageOf(34, [sectorRow("Forestry", "Removals", REMOVALS)]),
      ],
      2021,
    );
    expect(result.summary.selectedPages).toEqual([12, 13]);
    expect(result.summary.importedSum).toBe(GROSS);
    // The gross-only import is not silent.
    expect(extractionReviewNotes(result.summary).removalsWarning).toEqual({
      kind: "gross-only",
      net: NET,
    });
  });

  it.each(["Net forestry", "Forestry (net)"])(
    '8. "%s" as a total row is an orphan removal, not the net total',
    (label) => {
      const result = selectReconciledPages(
        [netSummary(), ...sectorPages(), pageOf(16, [total(REMOVALS, label)])],
        2021,
      );
      expect(result.summary.importedSum).toBe(GROSS);
      expect(result.summary.orphanRemovals).toEqual([REMOVALS]);
      expect(extractionReviewNotes(result.summary).removalsWarning).toEqual({
        kind: "orphan",
        removals: REMOVALS,
        net: NET,
      });
    },
  );

  it("9. a positive AFOLU total without V.2 rows raises no warning", () => {
    const result = selectReconciledPages(
      [
        summaryPage(total(GROSS, "Total Emissions")),
        ...sectorPages(),
        pageOf(16, [
          row(null, null, 100000, {
            sector: AFOLU,
            subsector: null,
            category: "Total",
            rowType: "total",
          }),
        ]),
      ],
      2021,
    );
    expect(result.summary.orphanRemovals ?? []).toEqual([]);
    expect(extractionReviewNotes(result.summary).removalsWarning).toBeNull();
  });

  it("5. a negative net total without the word net is not an orphan removal", () => {
    const result = selectReconciledPages(
      [
        summaryPage(
          total(GROSS, "Total Emissions"),
          total(NET, "Overall balance"),
        ),
        ...sectorPages(),
      ],
      2021,
    );
    expect(result.summary.orphanRemovals ?? []).toEqual([]);
    expect(extractionReviewNotes(result.summary).removalsWarning).toBeNull();
  });
});

describe("CC-1161 reconciliation targets", () => {
  const reported = (
    value: number,
    label: string,
    extra: Partial<ReportedTotal> = {},
  ): ReportedTotal => ({
    label,
    value,
    year: 2021,
    scope: null,
    sector: null,
    subsector: null,
    level: "total",
    ...extra,
  });

  it("keeps a removals total out of the grand totals and out of the largest", () => {
    const targets = reconciliationTargets(
      [
        reported(GROSS, "Total Emissions (gross)"),
        reported(NET, "Total Net Emissions (including Forestry)"),
        reported(REMOVALS, "Forestry removals", { sector: "Forestry" }),
      ],
      2021,
    );
    expect(targets.grand).toEqual([GROSS]);
    // The net label names forestry too; "net" wins, it is not a removals total.
    expect(targets.net).toEqual([NET]);
    expect(targets.removals).toEqual([REMOVALS]);
  });

  it("takes 'net' beside a removals word for removals, not for the city net total", () => {
    const targets = reconciliationTargets(
      [
        reported(GROSS, "Total Emissions (gross)"),
        reported(NET, "Total Net Emissions (including Forestry)"),
        reported(REMOVALS, "Net forestry"),
        reported(REMOVALS - 1, "Forestry (net)"),
      ],
      2021,
    );
    expect(targets.grand).toEqual([GROSS]);
    expect(targets.net).toEqual([NET]);
    expect(targets.removals).toEqual([REMOVALS, REMOVALS - 1]);
  });

  it("does not take the AFOLU sector for removals", () => {
    const targets = reconciliationTargets(
      [
        reported(GROSS, "Total Emissions"),
        reported(100000, "Total", { sector: AFOLU }),
        reported(90000, "AFOLU total"),
      ],
      2021,
    );
    expect(targets.removals).toEqual([]);
  });

  it("does not take a negative total for removals by its sign", () => {
    const targets = reconciliationTargets(
      [reported(GROSS, "Total Emissions"), reported(NET, "Overall balance")],
      2021,
    );
    expect(targets.removals).toEqual([]);
  });
});
