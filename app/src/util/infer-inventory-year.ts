const YEAR_LABEL =
  /^(inventory\s*year|reporting\s*year|reference\s*year|year)\b/i;

function asInventoryYear(value: unknown): number | undefined {
  if (typeof value === "number" && value >= 1900 && value <= 2100) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const match = value.trim().match(/\b(?:19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

export interface YearScanSheet {
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

/**
 * Inventory year from a year column, or from a label/value pair on any sheet
 * (eCRF inventory-details sheets keep the year off the activity table).
 */
export function inferInventoryYearFromSheets(
  sheets: YearScanSheet[],
): number | undefined {
  for (const sheet of sheets) {
    const headers = sheet.headers.filter(Boolean);

    for (const header of headers) {
      if (!YEAR_LABEL.test(header.trim())) continue;
      for (const row of sheet.rows) {
        const year = asInventoryYear(row[header]);
        if (year != null) return year;
      }
    }

    for (const row of sheet.rows) {
      const cells = headers.map((header) => row[header]);
      for (let i = 0; i < cells.length; i++) {
        const label = typeof cells[i] === "string" ? cells[i].trim() : "";
        if (!YEAR_LABEL.test(label)) continue;
        const year =
          asInventoryYear(cells[i + 1]) ?? asInventoryYear(cells[i - 1]);
        if (year != null) return year;
      }
    }
  }

  return undefined;
}
