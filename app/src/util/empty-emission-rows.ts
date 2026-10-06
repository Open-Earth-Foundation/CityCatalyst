import {
  hasSignedNumericValue,
  parseNumericCell,
} from "@/util/parse-numeric-cell";

const EMISSION_COLUMN_KEYS = ["co2", "ch4", "n2o", "totalCO2e"] as const;

/**
 * Rows where a mapped CO2, CH4, N2O, or total CO2e cell is blank or zero.
 * A column that was not mapped is ignored, so a total-only file is not
 * counted as empty for the gases it does not have.
 */
export function countRowsWithEmptyEmissionCells(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  detectedColumns: Record<string, number | undefined>,
): number {
  const indexes = EMISSION_COLUMN_KEYS.map(
    (key) => detectedColumns[key],
  ).filter(
    (index): index is number =>
      typeof index === "number" && index >= 0 && index < headers.length,
  );
  if (indexes.length === 0) return 0;

  return rows.filter((row) =>
    indexes.some((index) => {
      const header = headers[index];
      return !hasSignedNumericValue(parseNumericCell(row[header]));
    }),
  ).length;
}
