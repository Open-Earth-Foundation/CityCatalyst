import { describe, expect, it } from "@jest/globals";
import {
  extractionReviewNotes,
  reconcileExtraction,
  type ExtractionSummary,
  type ReportedTotal,
} from "@/util/GHGI/extraction-summary";
import type { ConfirmedTotal } from "@/util/GHGI/source-checks";

const total = (
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
  inText: true,
  ...extra,
});

const BASIC = 7453238;
const BASIC_PLUS = 9559215;

const summary = (
  reportedTotals: ReportedTotal[],
  importedSum: number,
  selected?: ConfirmedTotal,
  status: "pending" | "confirmed" = "confirmed",
): ExtractionSummary =>
  ({
    reportedTotals,
    importedSum,
    targetYear: 2021,
    ...(selected
      ? {
          sourceChecks: {
            total: { status, candidates: [], selected, suggested: null },
          },
        }
      : {}),
  }) as ExtractionSummary;

const auckland = [total(BASIC, "BASIC"), total(BASIC_PLUS, "BASIC+")];

const netDocument = [
  total(10000, "Total gross emissions"),
  total(-1200, "Net forestry", { level: "subtotal", sector: "AFOLU" }),
  total(8800, "Total net emissions"),
];

describe("reconcileExtraction with a confirmed total", () => {
  it("confirmed document total reconciles", () => {
    const r = reconcileExtraction(
      summary([total(412300, "Total")], 412000, {
        value: 412300,
        origin: "document",
      }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("confirmed");
  });

  it("user total is sole target", () => {
    const r = reconcileExtraction(
      summary([total(412300, "Total")], 412300, {
        value: 500000,
        origin: "user",
      }),
    )!;
    expect(r.mismatch).toBe(true);
    expect(r.reportedTotal).toBe(500000);
    expect(r.source).toBe("confirmed");
    expect(r.confirmedTotal).toBe(500000);
  });

  it("keeps the other document totals when a document total is confirmed", () => {
    const r = reconcileExtraction(
      summary(auckland, BASIC_PLUS, { value: BASIC, origin: "document" }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.reportedTotal).toBe(BASIC_PLUS);
    expect(r.source).toBe("document");
    expect(r.confirmedTotal).toBe(BASIC);
  });

  it("reports source confirmed when the sum matches the confirmed document total", () => {
    const r = reconcileExtraction(
      summary(auckland, BASIC_PLUS, { value: BASIC_PLUS, origin: "document" }),
    )!;
    expect(r.source).toBe("confirmed");
    expect(r.reportedTotal).toBe(BASIC_PLUS);
    expect(r.mismatch).toBe(false);
  });

  it("puts the confirmed document total first among the targets", () => {
    // Equidistant from both: the first candidate (the confirmed one) wins.
    const r = reconcileExtraction(
      summary(auckland, (BASIC + BASIC_PLUS) / 2, {
        value: BASIC_PLUS,
        origin: "document",
      }),
    )!;
    expect(r.reportedTotal).toBe(BASIC_PLUS);
  });

  it("a user total that matches the sum reconciles", () => {
    const r = reconcileExtraction(
      summary(netDocument, 8800, { value: 8800, origin: "user" }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("confirmed");
  });

  it("a user total leaves the document totals out of the targets", () => {
    const r = reconcileExtraction(
      summary(netDocument, 10000, { value: 8800, origin: "user" }),
    )!;
    expect(r.mismatch).toBe(true);
    expect(r.reportedTotal).toBe(8800);
  });

  it("ignores a pending total", () => {
    const r = reconcileExtraction(
      summary(auckland, BASIC_PLUS, { value: 1, origin: "user" }, "pending"),
    )!;
    expect(r.source).toBe("document");
    expect(r.confirmedTotal).toBeUndefined();
  });

  it("is unchanged without sourceChecks and ignores a legacy userReportedTotal", () => {
    const legacy = {
      ...summary(auckland, BASIC_PLUS),
      userReportedTotal: { value: 1, kind: "gross" },
    } as unknown as ExtractionSummary;
    for (const s of [summary(auckland, BASIC_PLUS), legacy]) {
      const r = reconcileExtraction(s)!;
      expect(r.source).toBe("document");
      expect(r.reportedTotal).toBe(BASIC_PLUS);
      expect(r.mismatch).toBe(false);
      expect(r.confirmedTotal).toBeUndefined();
    }
  });

  it("notes another printed total matched instead of the confirmed one", () => {
    const notes = extractionReviewNotes(
      summary(auckland, BASIC_PLUS, { value: BASIC, origin: "document" }),
    );
    expect(notes.reconciliation?.mismatch).toBe(false);
    expect(notes.confirmedTotalNote).toEqual({
      matched: BASIC_PLUS,
      confirmed: BASIC,
    });
  });

  it("no confirmed-total note when the confirmed total matched", () => {
    for (const s of [
      summary(auckland, BASIC_PLUS, { value: BASIC_PLUS, origin: "document" }),
      summary(auckland, BASIC_PLUS),
      summary(
        auckland,
        BASIC_PLUS,
        { value: BASIC, origin: "document" },
        "pending",
      ),
    ]) {
      expect(extractionReviewNotes(s).confirmedTotalNote).toBeNull();
    }
  });

  it("no confirmed-total note on a mismatch: the banner speaks", () => {
    const notes = extractionReviewNotes(
      summary(auckland, 1000, { value: BASIC, origin: "document" }),
    );
    expect(notes.reconciliation?.mismatch).toBe(true);
    expect(notes.confirmedTotalNote).toBeNull();
  });

  it("notes the net total matched when the gross was confirmed", () => {
    const notes = extractionReviewNotes(
      summary(netDocument, 8800, { value: 10000, origin: "document" }),
    );
    expect(notes.reconciliation?.mismatch).toBe(false);
    expect(notes.confirmedTotalNote).toEqual({
      matched: 8800,
      confirmed: 10000,
    });
  });

  it("review notes no longer carry userTotalNote or numberFormatConflict", () => {
    const notes = extractionReviewNotes(summary(auckland, BASIC_PLUS));
    expect(notes).not.toHaveProperty("userTotalNote");
    expect(notes).not.toHaveProperty("numberFormatConflict");
  });
});

describe("reconcileExtraction with a negative confirmed net total", () => {
  // Masterton 2021/22: gross 785,873, forestry -811,512, net -25,639 tCO2e.
  const masterton = [
    total(785873, "Total gross emissions"),
    total(-811512, "Forestry removals", { level: "subtotal", sector: "AFOLU" }),
    total(-25639, "Total net emissions"),
  ];

  it("matches an imported sum equal to the negative net total", () => {
    const r = reconcileExtraction(
      summary(masterton, -25639, { value: -25639, origin: "user" }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("confirmed");
    expect(r.reportedTotal).toBe(-25639);
  });

  it("matches without a document net total printed", () => {
    const r = reconcileExtraction(
      summary([total(785873, "Total gross emissions")], -25639, {
        value: -25639,
        origin: "user",
      }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("confirmed");
  });
});
