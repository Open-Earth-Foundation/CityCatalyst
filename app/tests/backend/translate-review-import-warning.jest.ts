import { describe, expect, it } from "@jest/globals";
import type { TFunction } from "i18next";
import {
  rowImportWarnings,
  translateReviewImportWarning,
} from "@/util/translate-review-import-warning";

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction;

describe("translateReviewImportWarning", () => {
  it("translates stored English skip lines", () => {
    expect(
      translateReviewImportWarning(
        "Row 12: Skipped - no emission values or notation key (Energy / Mystery)",
        t,
      ),
    ).toBe("import-row-number 12: import-row-issue-no-value-or-notation-key");
    expect(
      translateReviewImportWarning(
        'Row 4: Could not resolve a GPC reference from sector "X" and sub-sector "Y". This row will not be imported.',
        t,
      ),
    ).toBe("import-row-number 4: import-row-issue-gpc-reference-unresolved");
  });

  it("keeps only Row N: warnings", () => {
    expect(
      rowImportWarnings([
        "Row 3: Skipped - no emission values or notation key",
        "No gas emission values found in data rows",
      ]),
    ).toEqual(["Row 3: Skipped - no emission values or notation key"]);
  });
});
