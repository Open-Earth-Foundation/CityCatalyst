import { describe, expect, it } from "@jest/globals";
import {
  extractionReviewNotes,
  reconcileExtraction,
  type ExtractionSummary,
  type ReportedTotal,
} from "@/util/GHGI/extraction-summary";

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
  userReportedTotal?: ExtractionSummary["userReportedTotal"],
): ExtractionSummary =>
  ({
    reportedTotals,
    importedSum,
    targetYear: 2021,
    userReportedTotal,
  }) as ExtractionSummary;

const auckland = [total(BASIC, "BASIC"), total(BASIC_PLUS, "BASIC+")];

const netDocument = [
  total(10000, "Total gross emissions"),
  total(-1200, "Net forestry", { level: "subtotal", sector: "AFOLU" }),
  total(8800, "Total net emissions"),
];

describe("reconcileExtraction with a user-reported total", () => {
  it("keeps the document total the sum matched when the user entered the other one", () => {
    const s = summary(auckland, BASIC_PLUS, { value: BASIC, kind: "gross" });
    const r = reconcileExtraction(s)!;
    expect(r.mismatch).toBe(false);
    expect(r.reportedTotal).toBe(BASIC_PLUS);
    expect(r.source).toBe("document");
    expect(extractionReviewNotes(s).userTotalNote).toEqual({
      kind: "matched-other-document-total",
      matched: BASIC_PLUS,
      entered: BASIC,
    });
  });

  it("reports source user when the sum matches the entered total", () => {
    const s = summary(auckland, BASIC_PLUS, {
      value: BASIC_PLUS,
      kind: "gross",
    });
    const r = reconcileExtraction(s)!;
    expect(r.source).toBe("user");
    expect(r.reportedTotal).toBe(BASIC_PLUS);
    expect(extractionReviewNotes(s).userTotalNote).toBeNull();
  });

  it("uses only the user total when it matches no document total", () => {
    const s = summary(auckland, BASIC_PLUS, { value: 8000000, kind: "gross" });
    const r = reconcileExtraction(s)!;
    expect(r.mismatch).toBe(true);
    expect(r.reportedTotal).toBe(8000000);
    expect(r.source).toBe("user");
    expect(r.userTotal).toBe(8000000);
    expect(extractionReviewNotes(s).userTotalNote).toBeNull();
  });

  it("reconciles a net user total against the document net", () => {
    const s = summary(netDocument, 8800, { value: 8800, kind: "net" });
    const r = reconcileExtraction(s)!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("user");
  });

  it("confirms a net user total when the sum matches the document gross", () => {
    const s = summary(netDocument, 10000, { value: 8800, kind: "net" });
    const r = reconcileExtraction(s)!;
    expect(r.mismatch).toBe(false);
    expect(r.reportedTotal).toBe(10000);
    expect(r.source).toBe("document");
    expect(extractionReviewNotes(s).userTotalNote).toEqual({
      kind: "matched-other-document-total",
      matched: 10000,
      entered: 8800,
    });
  });

  it("does not confirm a gross total with the document net", () => {
    const s = summary(netDocument, 8800, { value: 8800, kind: "gross" });
    const r = reconcileExtraction(s)!;
    expect(r.source).toBe("user");
    expect(r.mismatch).toBe(false);
    expect(r.reportedTotal).toBe(8800);
    // Gross 10,000 is not a candidate: a sum of 10,000 would mismatch.
    expect(
      reconcileExtraction(
        summary(netDocument, 10000, { value: 8800, kind: "gross" }),
      )!.mismatch,
    ).toBe(true);
  });

  it("does not confirm with a document total that is not in the text", () => {
    const s = summary(
      [total(BASIC, "BASIC"), total(BASIC_PLUS, "BASIC+", { inText: false })],
      BASIC_PLUS,
      { value: BASIC_PLUS, kind: "gross" },
    );
    const r = reconcileExtraction(s)!;
    expect(r.source).toBe("user");
    expect(r.reportedTotal).toBe(BASIC_PLUS);
  });

  it("is unchanged without a user total", () => {
    const r = reconcileExtraction(summary(auckland, BASIC_PLUS))!;
    expect(r.source).toBe("document");
    expect(r.reportedTotal).toBe(BASIC_PLUS);
    expect(r.mismatch).toBe(false);
    expect(r.userTotal).toBeUndefined();
  });

  it("passes numberFormatConflict through the review notes", () => {
    const conflict = { chosen: "english", detected: "european" } as const;
    const s = {
      ...summary(auckland, BASIC_PLUS),
      numberFormatConflict: conflict,
    } as ExtractionSummary;
    expect(extractionReviewNotes(s).numberFormatConflict).toEqual(conflict);
    expect(extractionReviewNotes(null).numberFormatConflict).toBeNull();
  });
});

describe("reconcileExtraction with a negative user net total", () => {
  // Masterton 2021/22: gross 785,873, forestry -811,512, net -25,639 tCO2e.
  const masterton = [
    total(785873, "Total gross emissions"),
    total(-811512, "Forestry removals", { level: "subtotal", sector: "AFOLU" }),
    total(-25639, "Total net emissions"),
  ];

  it("matches an imported sum equal to the negative net total", () => {
    const r = reconcileExtraction(
      summary(masterton, -25639, { value: -25639, kind: "net" }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("user");
    expect(r.reportedTotal).toBe(-25639);
  });

  it("matches without a document net total printed", () => {
    const r = reconcileExtraction(
      summary([total(785873, "Total gross emissions")], -25639, {
        value: -25639,
        kind: "net",
      }),
    )!;
    expect(r.mismatch).toBe(false);
    expect(r.source).toBe("user");
  });
});
