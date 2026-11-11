/**
 * CC-1202: a PDF extraction with no importable rows must tell the user why.
 * Cases from the GHGI benchmark: Münster 2022 (only a grand total in the text)
 * and Guadalajara 2022 (sector values only inside images; the model returns []).
 */
import { describe, expect, it } from "@jest/globals";
import {
  zeroRowReason,
  type ExtractionSummary,
} from "@/util/GHGI/extraction-summary";

const summary = (over: Partial<ExtractionSummary> = {}): ExtractionSummary => ({
  reportedTotals: [],
  droppedRows: {},
  importedSum: 0,
  yearAssumed: false,
  targetYear: 2022,
  ...over,
});

describe("zeroRowReason", () => {
  it("names a document that only states totals (Münster)", () => {
    const result = zeroRowReason(
      summary({
        droppedRows: { subtotal_or_total: 1 },
        reportedTotals: [
          {
            label: "Total CO2 emissions",
            value: 1_788_000,
            year: 2022,
            scope: null,
            sector: null,
            subsector: null,
            level: "total",
          },
        ],
      }),
    );
    expect(result).toBe("pdf-extraction-only-totals");
  });

  it("names a missing year when the only totals belong to another year", () => {
    const result = zeroRowReason(
      summary({
        reportedTotals: [
          {
            label: "Total",
            value: 2_618_000,
            year: 1990,
            scope: null,
            sector: null,
            subsector: null,
            level: "total",
          },
        ],
      }),
    );
    expect(result).toBe("inventory-not-found-for-target-year");
  });

  it("names a document whose values all use units that cannot become tonnes", () => {
    const result = zeroRowReason(
      summary({ droppedRows: { unsupported_unit: 5 } }),
    );
    expect(result).toBe("pdf-extraction-unsupported-units");
  });

  it("names a document where the model found no values (Guadalajara)", () => {
    expect(zeroRowReason(summary())).toBe("pdf-extraction-no-data");
  });

  it("falls back to no data when there is no summary", () => {
    expect(zeroRowReason(null)).toBe("pdf-extraction-no-data");
  });
});
