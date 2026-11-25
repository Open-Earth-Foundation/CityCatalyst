import { findPendingRows } from "@/backend/ImportRowPreviewService";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import { ensureBulkRowsNeedNoReview } from "@/backend/InventoryFileAutoImportService";

function result(
  scope: string,
  decision: string | null = null,
): ECRFImportResult {
  return {
    requiresReferenceReview: true,
    rows: [
      {
        rowIndex: 0,
        gpcRefNo: "III.4.3",
        totalCO2e: 6300,
        review: {
          scope,
          refSource: "document",
          suggestedRefNo: "III.4.3",
          decision,
        },
      },
    ],
  } as unknown as ECRFImportResult;
}

describe("scope conflict review", () => {
  it("holds a reference that conflicts with a Scope 3 label", () => {
    expect(findPendingRows(result("Scope 3"))).toHaveLength(1);
  });

  it("prevents automatic bulk import from bypassing a pending conflict", () => {
    expect(() => ensureBulkRowsNeedNoReview(result("Scope 3"))).toThrow(
      "review",
    );
  });

  it("does not accept keeping the original incompatible pair", () => {
    expect(findPendingRows(result("3", "keep"))).toHaveLength(1);
  });

  it("accepts a reclassification when the final reference matches the stated scope", () => {
    const input = result("3", "reclassify");
    input.rows[0].gpcRefNo = "III.4.2";
    expect(findPendingRows(input)).toHaveLength(0);
  });

  it("holds a non-waste reference inferred with an incompatible scope", () => {
    const input = result("Scope 2");
    input.rows[0].gpcRefNo = "I.1.1";
    input.rows[0].review!.suggestedRefNo = "I.1.1";
    input.rows[0].review!.refSource = "inferred";
    expect(findPendingRows(input)).toHaveLength(1);
  });
});
