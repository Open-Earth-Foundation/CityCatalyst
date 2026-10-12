import {
  hasSignedNumericValue,
  parseNumericCell,
} from "@/util/parse-numeric-cell";

const EMISSION_COLUMN_KEYS = ["co2", "ch4", "n2o", "totalCO2e"] as const;

/**
 * Rows the importer will skip: every mapped CO2, CH4, N2O, and total CO2e
 * cell is blank or zero, and there is no notation key. A total-only row is
 * kept. A column that was not mapped is ignored.
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

  const notationIndex = detectedColumns.notationKey;
  const hasNotationColumn =
    typeof notationIndex === "number" &&
    notationIndex >= 0 &&
    notationIndex < headers.length;

  return rows.filter((row) => {
    const emissionsEmpty = indexes.every((index) => {
      const header = headers[index];
      return !hasSignedNumericValue(parseNumericCell(row[header]));
    });
    if (!emissionsEmpty) return false;
    if (!hasNotationColumn || notationIndex == null) return true;
    const notation = row[headers[notationIndex]];
    return notation == null || String(notation).trim() === "";
  }).length;
}
