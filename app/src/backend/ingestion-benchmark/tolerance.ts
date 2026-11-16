/**
 * Tolerance rule (contract section 8): half a unit in the last printed digit.
 * Keys without printed-precision fields keep their legacy workbook tolerance.
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";

export type PrintedUnit = "t" | "kt" | "Mt" | "Gt";

export const UNIT_TONNES: Record<PrintedUnit, number> = {
  t: 1,
  kt: 1e3,
  Mt: 1e6,
  Gt: 1e9,
};

export type Tolerance = { tonnes: number; source: "rule" | "legacy" };

function fromRule(
  unit: PrintedUnit | undefined,
  decimals: number | undefined,
): number | null {
  if (unit === undefined || decimals === undefined) return null;
  return 0.5 * Math.pow(10, -decimals) * UNIT_TONNES[unit];
}

export function rowTolerance(key: KeyFile): Tolerance {
  const tonnes = fromRule(key.printedUnit, key.printedDecimals);
  return tonnes === null
    ? { tonnes: key.tolerance, source: "legacy" }
    : { tonnes, source: "rule" };
}

export function totalTolerance(key: KeyFile): Tolerance {
  const tonnes = fromRule(
    key.printedUnit,
    key.totalPrintedDecimals ?? key.printedDecimals,
  );
  return tonnes === null
    ? { tonnes: key.totalTolerance, source: "legacy" }
    : { tonnes, source: "rule" };
}
