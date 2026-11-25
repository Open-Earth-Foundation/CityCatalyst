/**
 * Decisions for rows the import review holds back (CC-1124). The review screen
 * asks the user to keep, reclassify or skip them and the approve route refuses
 * to import until every held row has a decision. The benchmark measures what
 * the model extracted, so the runner includes every held row, whatever its
 * issue (a reviewer might skip some, such as direction-unconfirmed rows). The
 * scores are therefore extraction quality, not what a reviewed import stores.
 *
 * One kind is never decided: rows of one reference that disagree on whether
 * they count in the total (merge-total-inclusion-mixed, CC-1311). Any choice
 * changes which amounts count, so the attempt ends as needs_review instead.
 */
import type { ImportRowReview } from "@/util/types";

export type HeldRowDecision = {
  reviewDecision: "keep" | "correct-scope";
  scope?: string;
  decisionFileId: string;
  decisionToken: string;
  decisionRef: string;
  decisionScope: string | null;
  decisionValue: number | null;
};

export type HeldRowDecisions = {
  /** Keyed by row index, the shape of `mappingOverrides.rowDecisions`. */
  decisions: Record<string, HeldRowDecision>;
  /** Rows given an include decision. */
  included: number;
  /** Rows the review offers no include decision for; the approve route will refuse them. */
  unresolved: number;
};

/**
 * "keep" includes a row as extracted. A reference-conflict row cannot be kept
 * (the review disables it), so it is included with the scope the catalogue
 * expects for its reference, the same choice the review screen offers.
 */
export function heldRowDecisions(
  rows: ImportRowReview[],
  fileId: string,
): HeldRowDecisions {
  const decisions: Record<string, HeldRowDecision> = {};
  let unresolved = 0;
  for (const row of rows) {
    const seen = {
      decisionFileId: fileId,
      decisionToken: row.decisionToken ?? "",
      decisionRef: row.suggestedRefNo,
      decisionScope: row.scope,
      decisionValue: row.value,
    };
    if (row.issue === "merge-total-inclusion-mixed") continue;
    if (row.issue !== "reference-conflict") {
      decisions[String(row.rowIndex)] = { reviewDecision: "keep", ...seen };
    } else if (row.expectedScope != null) {
      decisions[String(row.rowIndex)] = {
        reviewDecision: "correct-scope",
        scope: String(row.expectedScope),
        ...seen,
      };
    } else {
      unresolved += 1;
    }
  }
  return { decisions, included: Object.keys(decisions).length, unresolved };
}

/** Rows of one reference that disagree on whether they count in the total. */
export type TotalInclusionConflict = {
  gpcRefNo: string;
  counted: number;
  leftOut: number;
};

/**
 * Groups the rows of mixedTotalInclusionRows (ECRFImportService) by reference.
 * The caller passes them in, so this module loads no product code.
 */
export function totalInclusionConflicts(
  mixedRows: { gpcRefNo: string; leftOut: boolean }[],
): TotalInclusionConflict[] {
  const byRef = new Map<string, TotalInclusionConflict>();
  for (const row of mixedRows) {
    const conflict = byRef.get(row.gpcRefNo) ?? {
      gpcRefNo: row.gpcRefNo,
      counted: 0,
      leftOut: 0,
    };
    if (row.leftOut) conflict.leftOut += 1;
    else conflict.counted += 1;
    byRef.set(row.gpcRefNo, conflict);
  }
  return [...byRef.values()];
}

/** Names the references and row counts, never a value. */
export function needsReviewMessage(
  conflicts: TotalInclusionConflict[],
): string {
  const refs = conflicts
    .map(
      (c) =>
        `${c.gpcRefNo} (${c.counted} counted, ${c.leftOut} left out of the total)`,
    )
    .join(", ");
  return `needs review: rows of one reference disagree on whether they count in the total: ${refs}. The runner does not choose, so nothing is imported and the attempt is not scored.`;
}
