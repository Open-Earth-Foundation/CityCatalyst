/**
 * Reconciliation summary of an AI document extraction (PDF import).
 * Stored in `ImportedInventoryFile.mappingConfiguration.extractionSummary` and
 * shown on the review screen. No server imports: the browser uses this file too.
 */

/** A total or subtotal found in the document. Not imported; used to reconcile the imported sum. */
export type ReportedTotal = {
  label: string;
  value: number;
  year: number | null;
  scope: string | null;
  sector: string | null;
  subsector: string | null;
  level: "subtotal" | "total";
};

export type DroppedRowReason =
  | "subtotal_or_total"
  | "other_year"
  | "missing_year"
  | "unsupported_unit"
  | "duplicate";

export type ExtractionSummary = {
  reportedTotals: ReportedTotal[];
  droppedRows: Partial<Record<DroppedRowReason, number>>;
  /** Sum of imported totalCO2e in tonnes, without rows left out of inventory totals (I.4.4). */
  importedSum: number;
  /** True when no row had a year and every row was assigned the target year. */
  yearAssumed: boolean;
};

/** Imported sum may differ from the document total by this fraction before the review screen warns. */
export const RECONCILIATION_TOLERANCE = 0.01;

export type Reconciliation = {
  importedSum: number;
  /** Document total closest to the imported sum. */
  reportedTotal: number;
  /** |imported - reported| / reported for that total. */
  deviation: number;
  /** True when no document total is within the tolerance. */
  mismatch: boolean;
};

/**
 * Compare the imported sum with the grand totals the document reports. A document
 * can report several (BASIC, BASIC+): the sum is fine when it matches any of them.
 * Returns null when the document reported no usable grand total.
 */
export function reconcileExtraction(
  summary: Pick<ExtractionSummary, "reportedTotals" | "importedSum"> | null,
): Reconciliation | null {
  if (!summary) return null;
  const candidates = [
    ...new Set(
      (summary.reportedTotals ?? [])
        .filter(
          (total) =>
            total.level === "total" &&
            Number.isFinite(total.value) &&
            total.value !== 0,
        )
        .map((total) => total.value),
    ),
  ];
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDeviation = Infinity;
  for (const candidate of candidates) {
    const deviation =
      Math.abs(summary.importedSum - candidate) / Math.abs(candidate);
    if (deviation < bestDeviation) {
      best = candidate;
      bestDeviation = deviation;
    }
  }
  return {
    importedSum: summary.importedSum,
    reportedTotal: best,
    deviation: bestDeviation,
    mismatch: bestDeviation > RECONCILIATION_TOLERANCE,
  };
}
