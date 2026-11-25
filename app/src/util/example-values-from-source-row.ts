/**
 * Mapping-step example values must come from a single source row so the
 * preview is internally consistent (CC-1153). Mixing the first non-empty
 * cell from each column produced values that never appeared together.
 */

type CellValue = string | number | boolean | null;

function displayCellValue(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string") return raw;
  if (typeof raw === "boolean") return raw ? "TRUE" : "FALSE";
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.error === "string" && o.error)
      return `#${o.error.toUpperCase()}!`;
    if (o.result !== undefined) return displayCellValue(o.result);
  }
  return null;
}

function filledCellCount(
  row: Record<string, unknown> | undefined,
  headers: string[],
): number {
  if (!row) return 0;
  let count = 0;
  for (const header of headers) {
    if (displayCellValue(row[header]) != null) count += 1;
  }
  return count;
}

/**
 * Prefer the earliest row that has the most populated mapped cells.
 */
export function pickExampleSourceRowIndex(
  rows: Array<Record<string, unknown>>,
  headers: string[],
): number {
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < rows.length; i++) {
    const score = filledCellCount(rows[i], headers);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function exampleValuesFromSingleRow(
  headers: string[],
  rows: Array<Record<string, CellValue | unknown>>,
  maxLength = 50,
): { exampleRowIndex: number; values: Record<string, string | null> } {
  const exampleRowIndex = pickExampleSourceRowIndex(rows, headers);
  const row = rows[exampleRowIndex] ?? {};
  const values: Record<string, string | null> = {};
  for (const header of headers) {
    const display = displayCellValue(row[header]);
    values[header] =
      display != null && display !== "[object Object]"
        ? display.substring(0, maxLength)
        : null;
  }
  return { exampleRowIndex, values };
}

export function exampleValuesFromRecord(
  record: Record<string, unknown>,
  keys: string[],
  maxLength = 50,
): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const key of keys) {
    const display = displayCellValue(record[key]);
    values[key] =
      display != null && display !== "[object Object]"
        ? display.substring(0, maxLength)
        : null;
  }
  return values;
}
