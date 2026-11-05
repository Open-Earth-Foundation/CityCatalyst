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
  /**
   * Totals and subtotals of forestry removals the document reports while the selected
   * rows hold no removals line item (no V.2 row). The imported sum then leaves the
   * removals out. Missing on summaries stored before this field.
   */
  orphanRemovals?: number[];
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

/** Words that name forestry removals in a label, sector or sub-sector. */
const REMOVALS_LABEL = /forestry|removals?|sequestration/i;

/** The whole AFOLU sector contains the word "forestry" but is not the removals. */
const AFOLU_NAME =
  /agriculture,?\s*forestry\s*(?:and|&)\s*other\s*land\s*use|\bafolu\b/gi;

/** "Gross emissions (excluding forestry)" names a total without the removals. */
const EXCLUDING_REMOVALS =
  /excl(?:uding|udes|\.)?\s+(?:forestry|removals?|sequestration)/gi;

/**
 * True when the text names forestry removals. The AFOLU sector name and an
 * "excluding forestry" phrase do not count.
 */
export function namesRemovals(text: string): boolean {
  return REMOVALS_LABEL.test(
    text.replace(AFOLU_NAME, " ").replace(EXCLUDING_REMOVALS, " "),
  );
}

/** Phrases that name the city total net of removals, whatever else the label says. */
const CITY_NET_PHRASE =
  /after\s+(?:removals?|sequestration)|incl(?:uding|\.)?\s+(?:forestry|removals?|sequestration)/i;

/**
 * Label of a net total: the gross total minus forestry removals, so far below the
 * gross figure ("Total Net Emissions (including Forestry)"). Only a total with such a
 * label may stand below the share of the largest total. "Net" next to a removals word
 * ("Net forestry", "Forestry (net)") is the net of the removals themselves, not the
 * city total, unless the label also says "total".
 */
export function isNetTotalLabel(label: string): boolean {
  if (CITY_NET_PHRASE.test(label)) return true;
  if (!/\bnet\b/i.test(label)) return false;
  return !namesRemovals(label) || /\btotal\b/i.test(label);
}

/**
 * True for a total of forestry removals (-811,512 "Forestry removals"). Decided by
 * words only, never by the sign: a net total is negative too. A label that names the
 * city's net total ("Net emissions (including Forestry)") is a net total, not
 * removals; "Net forestry" is removals. The AFOLU sector name alone is not removals.
 */
export function isRemovalsTotal(total: ReportedTotal): boolean {
  if (isNetTotalLabel(total.label)) return false;
  return [total.label, total.sector, total.subsector].some(
    (text) => text != null && namesRemovals(text),
  );
}

/**
 * Values of the removals totals and subtotals of the year, scope totals left out.
 * The model often types the forestry line a subtotal ("Net Forestry Emissions",
 * Masterton); a removals subtotal still says the removals belong in the inventory.
 */
export function removalsTotals(
  totals: ReportedTotal[] | null | undefined,
  targetYear?: number | null,
): number[] {
  const values = new Set<number>();
  for (const total of totals ?? []) {
    if (
      !total.scope &&
      Number.isFinite(total.value) &&
      total.value !== 0 &&
      (total.year == null || targetYear == null || total.year === targetYear) &&
      isRemovalsTotal(total)
    ) {
      values.add(total.value);
    }
  }
  return [...values];
}

export type ReconciliationTargets = {
  /** City totals: at least the share of the largest reported total of the year. */
  grand: number[];
  /** Net totals: below the share but labeled as net. */
  net: number[];
  /** Totals of forestry removals. Never a target: they stand for a part of the city. */
  removals: number[];
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
  const candidates = (totals ?? []).filter(
    (total) =>
      isGrandTotal(total) &&
      Number.isFinite(total.value) &&
      total.value !== 0 &&
      // A grand total of another year (a 2016 comparison) is no target.
      (total.year == null || targetYear == null || total.year === targetYear),
  );
  // Removals can exceed the gross total (Masterton: -811,512 against 785,873). Left
  // among the candidates they would raise the share every other total is held to.
  const removals = new Set<number>();
  const ofYear = candidates.filter((total) => {
    if (!isRemovalsTotal(total)) return true;
    removals.add(total.value);
    return false;
  });
  const largest = Math.max(0, ...ofYear.map((total) => Math.abs(total.value)));
  const grand = new Set<number>();
  const net = new Set<number>();
  for (const total of ofYear) {
    if (Math.abs(total.value) >= largest * MIN_GRAND_TOTAL_SHARE) {
      grand.add(total.value);
    } else if (isNetTotalLabel(total.label)) {
      net.add(total.value);
    }
  }
  return { grand: [...grand], net: [...net], removals: [...removals] };
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

export type ZeroRowReason =
  | "pdf-extraction-only-totals"
  | "pdf-extraction-unsupported-units"
  | "pdf-extraction-no-data"
  | "inventory-not-found-for-target-year";

/**
 * Why an extraction left no row to import, as an i18n key (onboarding namespace).
 * Totals win over units: a document with one total and sector percentages is a
 * totals-only document for the user. Totals are kept before the year filter, so
 * totals of other years only mean the target year is missing.
 */
export function zeroRowReason(
  summary: ExtractionSummary | null,
): ZeroRowReason {
  const targetYear = summary?.targetYear ?? null;
  const totals = summary?.reportedTotals ?? [];
  const totalsForYear = totals.filter(
    (total) =>
      targetYear == null || total.year == null || total.year === targetYear,
  );
  if (totalsForYear.length > 0) {
    return "pdf-extraction-only-totals";
  }
  if (totals.length > 0) {
    return "inventory-not-found-for-target-year";
  }
  if ((summary?.droppedRows?.unsupported_unit ?? 0) > 0) {
    return "pdf-extraction-unsupported-units";
  }
  return "pdf-extraction-no-data";
}

/**
 * The imported rows may leave out the forestry removals:
 * - `orphan`: the document reports a removals total but no removals line item was
 *   imported (`removals` is that total, `net` the net total when the document has one);
 * - `gross-only`: the document reports a net total, yet the imported sum reaches a
 *   gross total and not the net one.
 */
export type RemovalsWarning =
  | { kind: "orphan"; removals: number; net: number | null }
  | { kind: "gross-only"; net: number };

/**
 * Warn when removals may be missing. Both causes can hold at once; then the orphan
 * warning wins, because it names the removals total. It informs and never blocks.
 */
export function removalsWarning(
  summary: ExtractionSummary | null,
): RemovalsWarning | null {
  if (!summary) return null;
  const targets = reconciliationTargets(
    summary.reportedTotals,
    summary.targetYear,
  );
  const net = targets.net[0] ?? null;
  const orphans = summary.orphanRemovals ?? [];
  if (orphans.length > 0) {
    return {
      kind: "orphan",
      removals: orphans.reduce((sum, value) => sum + value, 0),
      net,
    };
  }
  if (net == null) return null;
  const reaches = (target: number) =>
    Math.abs(summary.importedSum - target) / Math.abs(target) <=
    RECONCILIATION_TOLERANCE;
  if (targets.grand.some(reaches) && !targets.net.some(reaches)) {
    return { kind: "gross-only", net };
  }
  return null;
}

export type ExtractionReviewNotes = {
  reconciliation: Reconciliation | null;
  /** Pages to name in the "adds up to the total" note; empty when it would be false. */
  reconciledPages: number[];
  failedPages: number[];
  droppedReasons: DroppedRowReason[];
  removalsWarning: RemovalsWarning | null;
};

/** What the review screen tells the user about an extraction. */
export function extractionReviewNotes(
  summary: ExtractionSummary | null,
): ExtractionReviewNotes {
  const reconciliation = reconcileExtraction(summary);
  const warning = removalsWarning(summary);
  return {
    reconciliation,
    removalsWarning: warning,
    // Only when the sum really matches; otherwise the mismatch banner speaks. With a
    // removals warning the note "adds up to the total" would contradict it.
    reconciledPages:
      summary?.pageSelection === "reconciled" &&
      reconciliation != null &&
      !reconciliation.mismatch &&
      warning == null
        ? (summary.selectedPages ?? [])
        : [],
    failedPages: summary?.failedPages ?? [],
    droppedReasons: REPORTED_DROP_REASONS.filter(
      (reason) => (summary?.droppedRows?.[reason] ?? 0) > 0,
    ),
  };
}
