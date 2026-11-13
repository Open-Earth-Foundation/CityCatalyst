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
};

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
  const unitRatio = unitApplies
    ? UNIT_FACTOR[toUnit] / UNIT_FACTOR[fromUnit]
    : 1;

  let value = current * unitRatio;
  const ratio = unitRatio;
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
  for (const gas of GAS_KEYS) {
    const gasValue = item[gas];
    if (gasValue == null) continue;
    next[gas] = separatorChanged ? null : gasValue * ratio;
  }
  return next as R;
}

/** Items (rows or reported totals) converted from one set of readings to another. */
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

const BASIC_LABEL = /\bBASIC\b(?!\s*\+)/i;
const BASIC_PLUS_LABEL = /\bBASIC\s*\+(?!\s*S3)/i;

/**
 * Index of the reported total that matches the inventory level: the BASIC or
 * BASIC+ labeled one when present, else the largest positive total that is not
 * a net total. Null when no candidate qualifies.
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
  if (pattern) {
    const labeled = candidates.findIndex((c) => pattern.test(c.label));
    if (labeled >= 0) return labeled;
  }
  let best: number | null = null;
  candidates.forEach((c, i) => {
    if (!(c.value > 0) || isNetTotalLabel(c.label)) return;
    if (best == null || c.value > candidates[best].value) best = i;
  });
  return best;
}
