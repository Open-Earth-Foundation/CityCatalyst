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
  | "duplicate"
  | "other_page";

export type ExtractionSummary = {
  reportedTotals: ReportedTotal[];
  droppedRows: Partial<Record<DroppedRowReason, number>>;
  /** Sum of imported totalCO2e in tonnes, without rows left out of inventory totals (I.4.4). */
  importedSum: number;
  /** True when no row had a year and every row was assigned the target year. */
  yearAssumed: boolean;
  /** Inventory year the extraction ran for. Missing on summaries stored before this field. */
  targetYear?: number | null;
  /**
   * `reconciled`: rows come only from `selectedPages`, whose sum matches a document
   * grand total. `fallback`: no page run matched; rows come from every page.
   * Missing when the document had no page markers (chunked extraction).
   */
  pageSelection?: "reconciled" | "fallback";
  selectedPages?: number[];
  /** Pages the model could not read twice in a row; their rows are missing. */
  failedPages?: number[];
};

/**
 * True for a total that can stand for the whole city: level "total" and no scope.
 * A scope total covers one scope column only. Sector totals are already stored as
 * "subtotal" when the extraction recognizes them (finalizeExtractedRows).
 */
export function isGrandTotal(total: ReportedTotal): boolean {
  return total.level === "total" && !total.scope;
}

/** Imported sum may differ from the document total by this fraction before the review screen warns. */
export const RECONCILIATION_TOLERANCE = 0.01;

/** Totals below this share of the largest reported total are sector or part totals. */
export const MIN_GRAND_TOTAL_SHARE = 0.5;

/**
 * Label of a net total: the gross total minus forestry removals, so far below the
 * gross figure ("Total Net Emissions (including Forestry)"). Only a total with such a
 * label may stand below the share of the largest total.
 */
const NET_TOTAL_LABEL =
  /\bnet\b|after\s+(?:removals?|sequestration)|incl(?:uding|\.)?\s+(?:forestry|removals?|sequestration)/i;

export type ReconciliationTargets = {
  /** City totals: at least the share of the largest reported total of the year. */
  grand: number[];
  /** Net totals: below the share but labeled as net. */
  net: number[];
};

/**
 * The totals an import may be reconciled against. A table that adds up to a small
 * total of its own (a council-operations table with its own "Total") is not a target:
 * it would make a wrong table look reconciled.
 */
export function reconciliationTargets(
  totals: ReportedTotal[] | null | undefined,
  targetYear?: number | null,
): ReconciliationTargets {
  const ofYear = (totals ?? []).filter(
    (total) =>
      isGrandTotal(total) &&
      Number.isFinite(total.value) &&
      total.value !== 0 &&
      // A grand total of another year (a 2016 comparison) is no target.
      (total.year == null || targetYear == null || total.year === targetYear),
  );
  const largest = Math.max(0, ...ofYear.map((total) => Math.abs(total.value)));
  const grand = new Set<number>();
  const net = new Set<number>();
  for (const total of ofYear) {
    if (Math.abs(total.value) >= largest * MIN_GRAND_TOTAL_SHARE) {
      grand.add(total.value);
    } else if (NET_TOTAL_LABEL.test(total.label)) {
      net.add(total.value);
    }
  }
  return { grand: [...grand], net: [...net] };
}

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
  summary: Pick<
    ExtractionSummary,
    "reportedTotals" | "importedSum" | "targetYear"
  > | null,
): Reconciliation | null {
  if (!summary) return null;
  const targets = reconciliationTargets(
    summary.reportedTotals,
    summary.targetYear,
  );
  const candidates = [...targets.grand, ...targets.net];
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

/** Drop reasons worth showing. Subtotals and totals are expected to be left out. */
export const REPORTED_DROP_REASONS: DroppedRowReason[] = [
  "other_year",
  "missing_year",
  "unsupported_unit",
  "duplicate",
  "other_page",
];

export type ExtractionReviewNotes = {
  reconciliation: Reconciliation | null;
  /** Pages to name in the "adds up to the total" note; empty when it would be false. */
  reconciledPages: number[];
  failedPages: number[];
  droppedReasons: DroppedRowReason[];
};

/** What the review screen tells the user about an extraction. */
export function extractionReviewNotes(
  summary: ExtractionSummary | null,
): ExtractionReviewNotes {
  const reconciliation = reconcileExtraction(summary);
  return {
    reconciliation,
    // Only when the sum really matches; otherwise the mismatch banner speaks.
    reconciledPages:
      summary?.pageSelection === "reconciled" &&
      reconciliation != null &&
      !reconciliation.mismatch
        ? (summary.selectedPages ?? [])
        : [],
    failedPages: summary?.failedPages ?? [],
    droppedReasons: REPORTED_DROP_REASONS.filter(
      (reason) => (summary?.droppedRows?.[reason] ?? 0) > 0,
    ),
  };
}
