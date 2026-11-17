import Excel from "exceljs";
import type { GoldRow, GoldStatus, GoldWorkbook, TrapEntry } from "./types";

const REQUIRED_HEADERS = [
  "field_id",
  "item_key",
  "gold value",
  "page",
  "evidence",
  "status",
  "notes",
] as const;

const GOLD_STATUSES: readonly string[] = [
  "FOUND",
  "PARTIAL",
  "NOT_FOUND",
  "N/A",
];

/** Reads any exceljs cell value (number, rich text, formula, hyperlink) as plain text. */
function cellText(value: Excel.CellValue | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();
  if ("richText" in value) {
    return value.richText
      .map((part) => part.text)
      .join("")
      .trim();
  }
  if ("result" in value) return cellText(value.result as Excel.CellValue);
  if ("text" in value) return cellText(value.text as Excel.CellValue);
  return "";
}

/**
 * Expands "32, 33" and "18 vs 84-95" into page numbers; ranges are inclusive
 * and may use an en or em dash ("32–35"), as typed in the Sheets.
 */
function parsePages(text: string): number[] {
  const pages: number[] = [];
  for (const match of text.matchAll(/(\d+)(?:\s*[-–—]\s*(\d+))?/g)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let page = start; page <= end; page++) pages.push(page);
  }
  return pages;
}

function sheet(wb: Excel.Workbook, name: string): Excel.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Gold workbook has no "${name}" tab`);
  return ws;
}

export async function readGoldWorkbook(path: string): Promise<GoldWorkbook> {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(path);

  const header = new Map<string, string>();
  sheet(wb, "Header").eachRow((row) => {
    const key = cellText(row.getCell(1).value).toLowerCase();
    if (key) header.set(key, cellText(row.getCell(2).value));
  });
  const pageCount = Number(header.get("pdf pages"));
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error(`Header tab: "PDF pages" is not a page count`);
  }

  const goldSheet = sheet(wb, "Gold");
  const columns = new Map<string, number>();
  goldSheet.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell.value).toLowerCase();
    if (name && !columns.has(name)) columns.set(name, col);
  });
  const missing = REQUIRED_HEADERS.filter((name) => !columns.has(name));
  if (missing.length > 0) {
    throw new Error(`Gold tab is missing headers: ${missing.join(", ")}`);
  }

  const rows: GoldRow[] = [];
  goldSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (name: string) =>
      cellText(row.getCell(columns.get(name)!).value);
    const fieldId = get("field_id");
    if (!fieldId) return;
    const status = get("status");
    if (!GOLD_STATUSES.includes(status)) {
      throw new Error(
        `Gold tab row ${rowNumber} (${fieldId}): unknown status "${status}"`,
      );
    }
    const notes = get("notes");
    rows.push({
      rowNumber,
      fieldId,
      itemKey: get("item_key"),
      goldValue: get("gold value"),
      pages: parsePages(get("page")),
      evidence: get("evidence"),
      status: status as GoldStatus,
      notes,
      trapNote: notes.startsWith("TRAP:"),
    });
  });

  const traps: TrapEntry[] = [];
  sheet(wb, "Traps").eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const page = cellText(row.getCell(1).value);
    if (!page) return;
    traps.push({
      pages: page.toLowerCase() === "all" ? "all" : parsePages(page),
      what: cellText(row.getCell(2).value),
      why: cellText(row.getCell(3).value),
    });
  });

  return {
    pdfFileName: header.get("pdf file name") ?? "",
    pageCount,
    rows,
    traps,
  };
}
