/**
 * Reconciliation summary of an AI document extraction (PDF import).
 * Stored in `ImportedInventoryFile.mappingConfiguration.extractionSummary` and
 * shown on the review screen. No server imports: the browser uses this file too.
 */

import type { NumberStyle } from "@/util/GHGI/source-text";
import type { ReportedTotalKind } from "@/util/GHGI/source-metadata";

/** A total or subtotal found in the document. Not imported; used to reconcile the imported sum. */
export type ReportedTotal = {
  label: string;
  value: number;
  year: number | null;
  scope: string | null;
  sector: string | null;
  subsector: string | null;
  level: "subtotal" | "total";
  /**
   * False when the value is not printed in the source text the model read: the
   * model invented or computed it, and it is no reconciliation target. Missing on
   * summaries stored before this check and when no source text was given.
   */
  inText?: boolean;
};

export type DroppedRowReason =
  | "subtotal_or_total"
  | "other_year"
  | "caption_year"
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
  /** The user's number format disagrees with what the document prints. */
  numberFormatConflict?: { chosen: NumberStyle; detected: NumberStyle };
  /** Total the user gave for the document; reconciliation target in the review. */
  userReportedTotal?: { value: number; kind: ReportedTotalKind };
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

/** Words that name forestry removals in a sub-sector, category or label. */
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
 * ("Net forestry", "Total Net Forestry Emissions") is the net of the removals
 * themselves: with a removals word, only a city-net phrase ("including forestry",
 * "after removals") makes the label a net total.
 */
export function isNetTotalLabel(label: string): boolean {
  if (CITY_NET_PHRASE.test(label)) return true;
  if (!/\bnet\b/i.test(label)) return false;
  return !namesRemovals(label);
}

export type ReconciliationTargets = {
  /** City totals: at least the share of the largest reported total of the year. */
  grand: number[];
  /** Net totals: gross plus removals by value, or labeled as net (zero included). */
  net: number[];
  /**
   * Totals and subtotals of forestry removals. Never a target: they stand for a part
   * of the city.
   */
  removals: number[];
  /** Largest grand total, in absolute value: the scale of a deviation from a zero net. */
  scale: number;
};

/**
 * Relative distance of `value` from a target. A net total can be zero; the distance
 * from it is then measured against the largest grand total (`scale`).
 */
export function targetDeviation(
  value: number,
  target: number,
  scale: number,
): number {
  const denominator = target !== 0 ? Math.abs(target) : Math.abs(scale);
  if (denominator === 0) return value === target ? 0 : Infinity;
  return Math.abs(value - target) / denominator;
}

/** True when `value` is within the reconciliation tolerance of `expected`. */
function withinTolerance(value: number, expected: number): boolean {
  return (
    Math.abs(value - expected) <= RECONCILIATION_TOLERANCE * Math.abs(expected)
  );
}

/**
 * Net and removals told apart by their values, whatever the labels say and in any
 * language: gross + removals = net (Masterton: 785,873 + -811,512 = -25,639).
 * The gross must be positive and the removals negative: the sum is symmetric in the
 * two, so without the signs the removals would pass for the gross.
 */
function netAndRemovalsByValue(
  grossCandidates: number[],
  values: number[],
): { net: Set<number>; removals: Set<number> } {
  const net = new Set<number>();
  const removals = new Set<number>();
  for (const gross of grossCandidates) {
    if (gross <= 0) continue;
    for (const candidateNet of values) {
      if (candidateNet === gross) continue;
      for (const candidateRemovals of values) {
        if (
          candidateRemovals < 0 &&
          candidateRemovals !== candidateNet &&
          candidateRemovals !== gross &&
          withinTolerance(candidateRemovals, candidateNet - gross)
        ) {
          net.add(candidateNet);
          removals.add(candidateRemovals);
        }
      }
    }
  }
  return { net, removals };
}

/**
 * The totals an import may be reconciled against, and the forestry removals.
 * A table that adds up to a small total of its own (a council-operations table with
 * its own "Total") is not a target: it would make a wrong table look reconciled.
 *
 * Removals and the net total are found by value (gross + removals = net), so labels
 * in any language and generic labels ("Total") work. A document without a net total
 * has no removals: words alone ("Sequestration") do not make a total removals.
 *
 * A total labeled as the city net ("Total net emissions", zero included) is a net
 * total whatever its size: a net 80% of the gross is still the net.
 *
 * The share of the largest total is taken among the positive totals that are not
 * labeled net when there are any: removals can exceed the gross (Masterton: -811,512
 * against 785,873) and would raise the share every other total is held to. For the
 * same reason a negative total is a grand total only when the document has no
 * positive one.
 */
export function reconciliationTargets(
  totals: ReportedTotal[] | null | undefined,
  targetYear?: number | null,
): ReconciliationTargets {
  const ofYear = (totals ?? []).filter(
    (total) =>
      !total.scope &&
      Number.isFinite(total.value) &&
      // A total not printed in the source text (model arithmetic) is no target.
      total.inText !== false &&
      // A total of another year (a 2016 comparison) is no target.
      (total.year == null || targetYear == null || total.year === targetYear),
  );
  const labeledNet = (total: ReportedTotal) =>
    isGrandTotal(total) && isNetTotalLabel(total.label);
  // Totals and subtotals without a scope: the city-wide parts. Zero only as a net.
  const cityTotals = ofYear.filter(
    (total) => total.value !== 0 || labeledNet(total),
  );
  const candidates = cityTotals.filter(isGrandTotal);
  const others = candidates.filter((total) => !labeledNet(total));
  const positive = others.some((total) => total.value > 0);
  const largest = Math.max(
    0,
    ...others
      .filter((total) => !positive || total.value > 0)
      .map((total) => Math.abs(total.value)),
  );
  const isGrand = (value: number) =>
    value !== 0 &&
    (!positive || value > 0) &&
    Math.abs(value) >= largest * MIN_GRAND_TOTAL_SHARE;

  const byValue = netAndRemovalsByValue(
    others.map((total) => total.value).filter(isGrand),
    cityTotals.map((total) => total.value),
  );

  const grand = new Set<number>();
  const net = new Set(byValue.net);
  for (const total of candidates) {
    if (byValue.removals.has(total.value) || byValue.net.has(total.value)) {
      continue;
    }
    if (labeledNet(total)) {
      net.add(total.value);
    } else if (isGrand(total.value)) {
      grand.add(total.value);
    }
  }
  return {
    grand: [...grand],
    net: [...net],
    removals: [...byValue.removals],
    scale: Math.max(0, ...[...grand].map((value) => Math.abs(value))),
  };
}

/**
 * Values of the removals totals and subtotals of the year, scope totals left out
 * (see reconciliationTargets). The model often types the forestry line a subtotal
 * ("Net Forestry Emissions", Masterton); a removals subtotal counts too.
 */
export function removalsTotals(
  totals: ReportedTotal[] | null | undefined,
  targetYear?: number | null,
): number[] {
  return reconciliationTargets(totals, targetYear).removals;
}

export type Reconciliation = {
  importedSum: number;
  /** Target the sum matched, or the closest target. */
  reportedTotal: number;
  /** |imported - reported| / reported for that total. */
  deviation: number;
  /** True when no target is within the tolerance. */
  mismatch: boolean;
  /** "user" when the target is the total the user gave (or a document total equal to it). */
  source: "user" | "document";
  /** Total the user gave, when there is one. */
  userTotal?: number;
};

/**
 * Compare the imported sum with the totals the document reports. A document can
 * report several (BASIC, BASIC+): the sum is fine when it matches any of them.
 *
 * A total the user gave is a target too. It confirms the document when a document
 * total of the same kind (grand for gross, net for net) is within the tolerance of
 * it; only then do the document totals stay targets. Otherwise the user total is the
 * only target. Returns null when there is no usable target.
 */
export function reconcileExtraction(
  summary: Pick<
    ExtractionSummary,
    "reportedTotals" | "importedSum" | "targetYear" | "userReportedTotal"
  > | null,
): Reconciliation | null {
  if (!summary) return null;
  const targets = reconciliationTargets(
    summary.reportedTotals,
    summary.targetYear,
  );
  const user = summary.userReportedTotal;
  const documentTargets = [...targets.grand, ...targets.net];
  let candidates = documentTargets;
  let scale = targets.scale;
  if (user) {
    scale = Math.max(Math.abs(user.value), targets.scale);
    const sameKind = user.kind === "net" ? targets.net : targets.grand;
    const confirmed = sameKind.some(
      (value) =>
        targetDeviation(value, user.value, scale) <= RECONCILIATION_TOLERANCE,
    );
    candidates = confirmed ? [user.value, ...documentTargets] : [user.value];
  }
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDeviation = Infinity;
  for (const candidate of candidates) {
    const deviation = targetDeviation(summary.importedSum, candidate, scale);
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
    source:
      user &&
      targetDeviation(best, user.value, scale) <= RECONCILIATION_TOLERANCE
        ? "user"
        : "document",
    ...(user ? { userTotal: user.value } : {}),
  };
}

/** Drop reasons worth showing. Subtotals and totals are expected to be left out. */
export const REPORTED_DROP_REASONS: DroppedRowReason[] = [
  "other_year",
  "caption_year",
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
 * One removals figure out of several that match the same gross and net (the same total
 * repeated on two pages, or rounded differently): they are alternative estimates, not
 * parts to add. Takes the one closest to net - gross; without a net, the largest.
 */
function oneRemovals(
  orphans: number[],
  targets: ReconciliationTargets,
): number {
  const expected = targets.net.flatMap((net) =>
    targets.grand.map((gross) => net - gross),
  );
  const distance = (value: number) =>
    expected.length > 0
      ? Math.min(...expected.map((e) => Math.abs(value - e)))
      : -Math.abs(value);
  return orphans.reduce((best, value) =>
    distance(value) < distance(best) ? value : best,
  );
}

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
    return { kind: "orphan", removals: oneRemovals(orphans, targets), net };
  }
  if (net == null) return null;
  const reaches = (target: number) =>
    targetDeviation(summary.importedSum, target, targets.scale) <=
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
  /** The sum matches another document total than the one the user entered. */
  userTotalNote: {
    kind: "matched-other-document-total";
    matched: number;
    entered: number;
  } | null;
  numberFormatConflict: { chosen: NumberStyle; detected: NumberStyle } | null;
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
    userTotalNote:
      reconciliation != null &&
      !reconciliation.mismatch &&
      reconciliation.source === "document" &&
      reconciliation.userTotal != null
        ? {
            kind: "matched-other-document-total",
            matched: reconciliation.reportedTotal,
            entered: reconciliation.userTotal,
          }
        : null,
    numberFormatConflict: summary?.numberFormatConflict ?? null,
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
