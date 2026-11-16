/**
 * Readings of the source checks on an imported value: the unit of an
 * ambiguous `MT` (one document-wide group), the unit of rows printed without
 * one on a page naming kt, Mt or kg (one group per page, or per table when
 * the rows were read from table cells), and the separator of
 * an ambiguous number such as `6.600`.
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
import type { SourceCell } from "@/util/GHGI/cell-values";

export type UnitReading = "t" | "kt" | "Mt";
const DEFAULT_UNIT: UnitReading = "t";
const DEFAULT_NUMBER_FORMAT: NumberReading = "english";
export type NumberReading = "european" | "english";
/**
 * Rows that share one unit reading: `"doc"` for the rows written "MT"; `"p12"`
 * for the rows of page 12 printed without a unit, `"p12:t3"` for those of
 * table t3 on page 12 when the row was read from a cell (`sourceCell`, the
 * structured path); `"unpaged"` for such rows without a page.
 */
export type UnitGroupKey = string;
/** Group of the rows written "MT", read document-wide. */
export const DOC_UNIT_GROUP: UnitGroupKey = "doc";
/** Readings of "MT": metric tonnes or megatonnes. */
export const DOC_UNIT_OPTIONS: UnitReading[] = ["t", "Mt"];
/** Readings of a page group of rows printed without a unit. */
export const UNIT_GROUP_OPTIONS: UnitReading[] = ["t", "kt", "Mt"];
export type Readings = {
  /** Unit reading of each group the import has (see `readingsOf`). */
  units: Record<UnitGroupKey, UnitReading>;
  numberFormat: NumberReading | null;
};

/** Tonnes per unit. */
export const UNIT_FACTOR: Record<UnitReading, number> = {
  t: 1,
  kt: 1000,
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
  /** Page of the item; groups rows with `unitCheck: "missing"`. */
  page?: number | null;
  /** Cell the value was read from (structured path): its table splits the page group. */
  sourceCell?: SourceCell | null;
  /**
   * "MT": the document-wide unit reading applies. "missing": the reading of
   * the item's page group applies (see `unitGroupKey`).
   */
  unitCheck?: "MT" | "missing" | null;
  /**
   * On `unitCheck: "MT"` items: the unit as the document printed it, before
   * cleaning ("MT CO2e", "Mt"). The unit card shows its spelling.
   */
  printedUnit?: string | null;
  numberCheck?: boolean | null;
  totalCO2eText?: string | null;
  printedFactor?: number | null;
  extractedGases?: ExtractedGases | null;
};

export type CheckStatus = "pending" | "confirmed";

/**
 * Rows of one page (or table) printed without a unit on a page whose captions
 * name kt, Mt or kg. An answer X means "the printed numbers of this group are
 * in X": each row becomes its printed value times `UNIT_FACTOR[X]`. Until then
 * each row keeps the value extracted under its own base reading
 * (`baseUnitReading`).
 */
export type UnitGroup = {
  key: UnitGroupKey;
  page: number | null;
  /** Table of the group's rows when they were read from cells (structured path). */
  tableId: string | null;
  rowCount: number;
  /**
   * Reading the card selects first: kt or Mt when every row's printed value
   * was scaled by that factor (`printedFactor`); else "kt" when the page names
   * only kt (or Gg), "Mt" when only Mt, else "t" (mixed units, or kg, which is
   * not an option).
   */
  preselected: UnitReading;
  options: UnitReading[];
  status: CheckStatus;
  /** The answered reading; null until answered (rows on their base readings). */
  reading: UnitReading | null;
  /**
   * True when the page names only kg, which no option reads, and the group
   * preselects "t" (no printed factor read a larger unit): such rows keep
   * their row-level keep-or-skip review. Absent otherwise.
   */
  kgOnly?: true;
};

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
  /** Page groups of rows printed without a unit, by page. */
  unitGroups?: UnitGroup[];
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
  const { unitGroups, ...single } = checks;
  return (
    Object.values(single).some((check) => check?.status === "pending") ||
    (unitGroups ?? []).some((group) => group.status === "pending")
  );
}

/**
 * Current readings of a summary's checks. A summary stored before unit groups
 * has only the "MT" reading, read as `{ doc: reading }`. An unanswered unit
 * group has no entry: its rows stay on their base readings.
 */
export function readingsOf(checks: SourceChecks | null | undefined): Readings {
  const units: Record<UnitGroupKey, UnitReading> = {};
  if (checks?.unit) units[DOC_UNIT_GROUP] = checks.unit.reading;
  for (const group of checks?.unitGroups ?? []) {
    if (group.reading) units[group.key] = group.reading;
  }
  return { units, numberFormat: checks?.numberFormat?.reading ?? null };
}

/**
 * Group whose unit reading applies to an item: `"doc"` for "MT"; for a
 * missing unit the page key, or the page and table key when the item was read
 * from a table cell (two tables of one page can print different units); null
 * when no unit reading applies.
 */
export function unitGroupKey(item: CheckableValue): UnitGroupKey | null {
  if (item.unitCheck === "MT") return DOC_UNIT_GROUP;
  if (item.unitCheck === "missing") {
    if (item.page == null) return "unpaged";
    return item.sourceCell
      ? `p${item.page}:${item.sourceCell.tableId}`
      : `p${item.page}`;
  }
  return null;
}

/**
 * Reading an item's value is under before its group is answered. For a row
 * without a printed unit it comes from `printedFactor` (1000: kt, 1,000,000:
 * Mt, else t), since that factor is the unit the model already applied. "MT"
 * items start in tonnes; their `printedFactor` excludes the MT factor.
 */
export function baseUnitReading(item: CheckableValue): UnitReading {
  if (item.unitCheck !== "missing") return DEFAULT_UNIT;
  if (item.printedFactor === UNIT_FACTOR.kt) return "kt";
  if (item.printedFactor === UNIT_FACTOR.Mt) return "Mt";
  return DEFAULT_UNIT;
}

/** Readings a unit group offers. */
export function unitOptions(key: UnitGroupKey): UnitReading[] {
  return key === DOC_UNIT_GROUP ? DOC_UNIT_OPTIONS : UNIT_GROUP_OPTIONS;
}

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

  const group = unitGroupKey(item);
  const unitApplies = group != null;
  const base = baseUnitReading(item);
  const fromUnit = (group && from.units[group]) || base;
  const toUnit = (group && to.units[group]) || base;
  // A missing unit's printedFactor is its base unit factor, which the unit
  // reading replaces; an MT item's printedFactor is apart from the MT factor.
  const textFactor =
    item.unitCheck === "missing" ? 1 : (item.printedFactor ?? 1);
  const fromFormat = from.numberFormat ?? DEFAULT_NUMBER_FORMAT;
  const toFormat = to.numberFormat ?? DEFAULT_NUMBER_FORMAT;
  // Multiply first, then divide: Mt to t by a ratio of 1e-6 drifts on decimals.
  const scale = (n: number) =>
    unitApplies ? (n * UNIT_FACTOR[toUnit]) / UNIT_FACTOR[fromUnit] : n;

  let value = scale(current);
  let separatorChanged = false;

  if (item.numberCheck && fromFormat !== toFormat && item.totalCO2eText) {
    const parsed = parseNumberString(item.totalCO2eText, toFormat);
    if (parsed != null) {
      value = parsed * textFactor * (unitApplies ? UNIT_FACTOR[toUnit] : 1);
      separatorChanged = true;
    }
  }

  if (value === current && !separatorChanged) return item;

  const next: CheckableValue = { ...item, [key]: value };
  const stored = item.extractedGases;
  const restore = separatorChanged && stored?.numberFormat === toFormat;
  // Gases of a missing unit were extracted under the row's base reading.
  const gasUnit = item.unitCheck === "missing" ? base : stored?.unit;
  for (const gas of GAS_KEYS) {
    if (restore && stored![gas] != null) {
      // Same convention as `scale`: multiply first, then divide.
      next[gas] = unitApplies
        ? (stored![gas]! * UNIT_FACTOR[toUnit]) / UNIT_FACTOR[gasUnit!]
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
 * An item's unit reading is that of its group (`unitGroupKey`); a group missing
 * from `from` or `to` leaves the item on its base reading (`baseUnitReading`).
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

/**
 * Imported total under each reading of one check (the number format, or one
 * unit group), every other reading kept as is. The PATCH endpoint stores
 * `sumImported(applyReadings(...))` too, so an option's total is the stored
 * `importedSum` after that answer.
 */
export function optionTotals(
  rows: ExtractedRow[],
  current: Readings,
  check: "numberFormat" | { unitGroup: UnitGroupKey },
): { reading: UnitReading | NumberReading; total: number }[] {
  const total = (to: Readings) => sumImported(applyReadings(rows, current, to));
  if (check === "numberFormat") {
    return (["english", "european"] as const).map((reading) => ({
      reading,
      total: total({ ...current, numberFormat: reading }),
    }));
  }
  const key = check.unitGroup;
  return unitOptions(key).map((reading) => ({
    reading,
    total: total({ ...current, units: { ...current.units, [key]: reading } }),
  }));
}

/**
 * Imported total under each reading of one unit group, with the other groups
 * at `selected` (the card's one Confirm answers them all). Each total is one
 * conversion from the stored rows, `sumImported(applyReadings(rows, current,
 * to))`, the same the PATCH endpoint stores, so it equals the stored
 * `importedSum` for that answer exactly.
 */
export function unitGroupOptionTotals(
  rows: ExtractedRow[],
  current: Readings,
  selected: Record<UnitGroupKey, UnitReading>,
  key: UnitGroupKey,
): { reading: UnitReading; total: number }[] {
  const units = { ...current.units, ...selected };
  return unitOptions(key).map((reading) => ({
    reading,
    total: sumImported(
      applyReadings(rows, current, {
        ...current,
        units: { ...units, [key]: reading },
      }),
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
