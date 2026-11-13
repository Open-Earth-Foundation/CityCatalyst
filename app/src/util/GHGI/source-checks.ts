/**
 * Readings of the two source checks on an imported value: the unit of an
 * ambiguous `MT` and the separator of an ambiguous number such as `6.600`.
 * The review card and the PATCH endpoint both use this module, so the totals a
 * person sees equal the totals that are imported.
 *
 * Pure module: no server imports (the browser imports it).
 */

import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import {
  isNetTotalLabel,
  type ExtractionSummary,
  type ReportedTotal,
} from "@/util/GHGI/extraction-summary";
import { isOmittedGPCReference } from "@/util/GHGI/reported-totals";
import { parseNumberString } from "@/util/GHGI/source-text";

export type UnitReading = "t" | "Mt";
export type NumberReading = "european" | "english";
export type Readings = {
  unit: UnitReading | null;
  numberFormat: NumberReading | null;
};

/** Tonnes per unit. */
export const UNIT_FACTOR: Record<UnitReading, number> = {
  t: 1,
  Mt: 1_000_000,
};

/** Plausible tonnes of CO2e per person per year, inclusive. */
export const PER_PERSON_RANGE = { min: 1, max: 20 } as const;

/**
 * Gas values of a row as extracted, under the number reading and unit reading
 * of that time. A separator change nulls the gases (the printed text carries
 * only the total); converting back to `numberFormat` restores these.
 */
export type ExtractedGases = {
  co2?: number | null;
  ch4?: number | null;
  n2o?: number | null;
  numberFormat: NumberReading;
  unit: UnitReading;
};

/** Fields of a row or reported total that a reading can change. */
export type CheckableValue = {
  totalCO2e?: number | null;
  value?: number;
  co2?: number | null;
  ch4?: number | null;
  n2o?: number | null;
  unitCheck?: "MT" | null;
  numberCheck?: boolean | null;
  totalCO2eText?: string | null;
  printedFactor?: number | null;
  extractedGases?: ExtractedGases | null;
};

export type CheckStatus = "pending" | "confirmed";

/** A document total the user confirmed, or a total the user typed. */
export type ConfirmedTotal = {
  value: number;
  origin: "document" | "user";
  label?: string;
  source?: string | null;
  page?: number | null;
};

/**
 * Checks the review step asks before approval
 * (`ExtractionSummary.sourceChecks`). A summary without them has no checks.
 */
export type SourceChecks = {
  /** Rows written in "MT": metric tonnes or megatonnes. */
  unit?: {
    status: CheckStatus;
    reading: UnitReading;
    evidence: {
      unitText: string;
      sources: string[];
      pages: number[];
      example: { label: string; text: string } | null;
    };
  };
  /** Rows printed like `6.600` in a document whose style is undetected. */
  numberFormat?: {
    status: CheckStatus;
    reading: NumberReading;
    /** At most 3. */
    examples: { label: string; text: string }[];
  };
  /** The document total the import is reconciled against. */
  total?: {
    status: CheckStatus;
    candidates: ReportedTotal[];
    selected: ConfirmedTotal | null;
    /** Index in `candidates` that matches the inventory level. */
    suggested: number | null;
  };
};

/**
 * True while any source check waits for an answer. Approval is blocked then.
 * A summary without checks (stored before them) has nothing pending.
 */
export function hasPendingSourceChecks(
  summary: Pick<ExtractionSummary, "sourceChecks"> | null | undefined,
): boolean {
  const checks = summary?.sourceChecks;
  if (!checks) return false;
  return Object.values(checks).some((check) => check?.status === "pending");
}

const DEFAULT_READINGS = { unit: "t", numberFormat: "english" } as const;

/** Sum of imported values in tonnes, without rows left out of totals. */
export function sumImported(rows: ExtractedRow[]): number {
  return rows.reduce(
    (sum, row) =>
      isOmittedGPCReference(row.gpcRefNo?.trim()) || row.totalCO2e == null
        ? sum
        : sum + row.totalCO2e,
    0,
  );
}

const GAS_KEYS = ["co2", "ch4", "n2o"] as const;

function convert<R extends CheckableValue>(
  item: R,
  from: Readings,
  to: Readings,
): R {
  const key = "totalCO2e" in item || !("value" in item) ? "totalCO2e" : "value";
  const current = item[key];
  if (current == null) return item;

  const fromUnit = from.unit ?? DEFAULT_READINGS.unit;
  const toUnit = to.unit ?? DEFAULT_READINGS.unit;
  const fromFormat = from.numberFormat ?? DEFAULT_READINGS.numberFormat;
  const toFormat = to.numberFormat ?? DEFAULT_READINGS.numberFormat;
  const unitApplies = item.unitCheck === "MT";
  // Multiply first, then divide: Mt to t by a ratio of 1e-6 drifts on decimals.
  const scale = (n: number) =>
    unitApplies ? (n * UNIT_FACTOR[toUnit]) / UNIT_FACTOR[fromUnit] : n;

  let value = scale(current);
  let separatorChanged = false;

  if (item.numberCheck && fromFormat !== toFormat && item.totalCO2eText) {
    const parsed = parseNumberString(item.totalCO2eText, toFormat);
    if (parsed != null) {
      value =
        parsed *
        (item.printedFactor ?? 1) *
        (unitApplies ? UNIT_FACTOR[toUnit] : 1);
      separatorChanged = true;
    }
  }

  if (value === current && !separatorChanged) return item;

  const next: CheckableValue = { ...item, [key]: value };
  const stored = item.extractedGases;
  const restore = separatorChanged && stored?.numberFormat === toFormat;
  for (const gas of GAS_KEYS) {
    if (restore && stored![gas] != null) {
      // Same convention as `scale`: multiply first, then divide.
      next[gas] = unitApplies
        ? (stored![gas]! * UNIT_FACTOR[toUnit]) / UNIT_FACTOR[stored!.unit]
        : stored![gas];
      continue;
    }
    const gasValue = item[gas];
    if (gasValue == null) continue;
    next[gas] = separatorChanged ? null : scale(gasValue);
  }
  return next as R;
}

/**
 * Items (rows or reported totals) converted from one set of readings to another.
 *
 * A separator change sets co2, ch4 and n2o to null: the text carries only the
 * total, so the gases cannot be rebuilt from it. They come back from
 * `extractedGases` when the separator returns to the reading they were
 * extracted under (scaled to the current unit reading). Callers always convert
 * from the stored rows with their current readings.
 */
export function applyReadings<R extends CheckableValue>(
  items: R[],
  from: Readings,
  to: Readings,
): R[] {
  return items.map((item) => convert(item, from, to));
}

/** Imported total under each reading of one check, the other check kept as is. */
export function optionTotals(
  rows: ExtractedRow[],
  current: Readings,
  check: "unit" | "numberFormat",
): { reading: UnitReading | NumberReading; total: number }[] {
  const readings: (UnitReading | NumberReading)[] =
    check === "unit" ? ["t", "Mt"] : ["english", "european"];
  return readings.map((reading) => ({
    reading,
    total: sumImported(
      applyReadings(rows, current, { ...current, [check]: reading }),
    ),
  }));
}

/** Tonnes of CO2e per person, or null without a positive population. */
export function perPerson(
  total: number,
  population: number | null | undefined,
): number | null {
  if (population == null || !(population > 0)) return null;
  return total / population;
}

export function inPerPersonRange(value: number): boolean {
  return value >= PER_PERSON_RANGE.min && value <= PER_PERSON_RANGE.max;
}

/** City-wide totals in tonnes judged without a population, inclusive. */
export const CITY_TOTAL_RANGE = { min: 1e3, max: 1e9 } as const;

/**
 * Whether a city inventory total in tonnes is plausible: by emissions per
 * person with a population, else by the total itself.
 */
export function totalPlausibility(
  total: number,
  population: number | null | undefined,
): "low" | "plausible" | "high" {
  const value = perPerson(total, population);
  const range = value == null ? CITY_TOTAL_RANGE : PER_PERSON_RANGE;
  const measured = value ?? total;
  if (measured > range.max) return "high";
  if (measured < range.min) return "low";
  return "plausible";
}

const BASIC_LABEL = /\bBASIC\b(?!\s*\+)/i;
const BASIC_PLUS_LABEL = /\bBASIC\s*\+(?!\s*S3)/i;

/**
 * Index of the reported total that matches the inventory level: the BASIC or
 * BASIC+ labeled one when present, else the largest. Only positive totals that
 * are not net totals qualify. Null when no candidate qualifies.
 */
export function selectLevelTotal(
  candidates: ReportedTotal[],
  inventoryType: "gpc_basic" | "gpc_basic_plus" | string | null,
): number | null {
  const pattern =
    inventoryType === "gpc_basic"
      ? BASIC_LABEL
      : inventoryType === "gpc_basic_plus"
        ? BASIC_PLUS_LABEL
        : null;
  const qualifies = (c: ReportedTotal) =>
    c.value > 0 && !isNetTotalLabel(c.label);
  if (pattern) {
    const labeled = candidates.findIndex(
      (c) => qualifies(c) && pattern.test(c.label),
    );
    if (labeled >= 0) return labeled;
  }
  let best: number | null = null;
  candidates.forEach((c, i) => {
    if (!qualifies(c)) return;
    if (best == null || c.value > candidates[best].value) best = i;
  });
  return best;
}
