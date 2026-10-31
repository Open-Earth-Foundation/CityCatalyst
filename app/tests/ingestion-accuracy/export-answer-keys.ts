/**
 * Converts the Product answer-key workbook (GHGI_PDF_answer_keys) into the JSON
 * that measure-ghgi-import.jest.ts and score.ts read.
 *
 *   npx tsx tests/ingestion-accuracy/export-answer-keys.ts <workbook.xlsx> <out.json>
 *
 * Reads the tabs Files, Answer_keys, Distractors and Open_questions. The
 * workbook itself is not kept in the repository.
 */
import Excel from "exceljs";
import { writeFileSync } from "node:fs";
import type { KeyDistractor, KeyFile, KeyRow } from "./score";

type Table = Record<string, string>[];

function cellText(value: Excel.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return String(value.result ?? "");
    }
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text ?? "");
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

function readTable(
  workbook: Excel.Workbook,
  name: string,
  firstHeader: string,
): Table {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Missing tab ${name}`);
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      cells[index - 1] = cellText(cell.value);
    });
    if (cells.some((cell) => cell && cell.trim())) rows.push(cells);
  });
  const headerIndex = rows.findIndex(
    (row) => (row[0] ?? "").trim() === firstHeader,
  );
  if (headerIndex < 0) throw new Error(`No header "${firstHeader}" in ${name}`);
  const header = rows[headerIndex].map((cell) => (cell ?? "").trim());
  return rows.slice(headerIndex + 1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = row[index] ?? "";
    });
    return record;
  });
}

/**
 * Numbers in free text, with either separator convention: "1,234.5", "1.234,5",
 * "3.505.046" and "1.100" (a dot followed by exactly three digits groups thousands).
 */
export function parseNumbers(text: string): number[] {
  const out: number[] = [];
  for (const token of text.match(/\d[\d.,]*\d|\d/g) ?? []) {
    const lastDot = token.lastIndexOf(".");
    const lastComma = token.lastIndexOf(",");
    let normalized: string;
    if (lastDot >= 0 && lastComma >= 0) {
      const decimal = lastDot > lastComma ? "." : ",";
      const group = decimal === "." ? "," : ".";
      normalized = token.split(group).join("").replace(decimal, ".");
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? "." : ",";
      const parts = token.split(sep);
      const grouped =
        parts.length > 2 ||
        (parts.length === 2 && parts[1].length === 3 && sep === ".") ||
        (sep === "," && /^\d{1,3}(,\d{3})+$/.test(token));
      normalized = grouped ? parts.join("") : parts.join(".");
    } else {
      normalized = token;
    }
    const number = Number(normalized);
    if (Number.isFinite(number)) out.push(number);
  }
  return out;
}

const toNumber = (value: string): number | null => {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : null;
};

/**
 * "Scored" applies to notation keys in the first workbook, where Value rows
 * leave it blank. So a blank Value row is scored; only an explicit "No" is not.
 */
export function isScored(scored: string, rowType: string): boolean {
  const text = (scored ?? "").trim().toLowerCase();
  if (text) return text === "yes";
  return (rowType ?? "").trim().startsWith("Value");
}

export function parseTolerance(text: string): {
  tolerance: number;
  totalTolerance: number;
} {
  const first = text.replace("±", "").match(/([\d.,]+)\s*t/);
  const tolerance = first ? Number(first[1].replace(/,/g, "")) : 0;
  // Only "total ±N" is a tolerance; "text total 23,787,113" is a note about the source.
  const total = text.match(/total\s*±\s*([\d,]+)/);
  return {
    tolerance,
    totalTolerance: total ? Number(total[1].replace(/,/g, "")) : tolerance,
  };
}

export async function exportAnswerKeys(workbookPath: string) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const files = readTable(workbook, "Files", "File ID");
  const keys = readTable(workbook, "Answer_keys", "File ID");
  const distractors = readTable(workbook, "Distractors", "File ID");
  const questions = readTable(workbook, "Open_questions", "ID");

  const out: { files: Record<string, KeyFile>; questions: Table } = {
    files: {},
    questions,
  };
  for (const file of files) {
    const id = file["File ID"].trim();
    if (!id) continue;
    out.files[id] = {
      id,
      city: file["City"],
      country: file["Country"],
      year: Number(file["Year to select"]),
      fileName: file["File name"],
      expectedTotal: toNumber(file["Expected total (tCO2e)"]),
      toleranceText: file["Tolerance"],
      ...parseTolerance(file["Tolerance"]),
      keyValueRows: toNumber(file["Key value rows"]),
      rows: [],
      distractors: [],
    };
  }
  for (const key of keys) {
    const target = out.files[key["File ID"].trim()];
    if (!target) continue;
    const row: KeyRow = {
      row: toNumber(key["Row"]),
      description: key["Description in source"],
      year: toNumber(key["Year"]),
      value: toNumber(key["Expected value (tCO2e)"]),
      gpc: key["Expected GPC ref"].trim(),
      scope: key["Expected GPC scope"].trim(),
      ambiguous: key["Ambiguous?"].trim().toLowerCase() === "yes",
      rowType: key["Row type"].trim(),
      notation: key["Expected notation key"].trim(),
      scored: isScored(key["Scored"], key["Row type"]),
      note: key["Note / rule applied"],
    };
    target.rows.push(row);
  }
  for (const item of distractors) {
    const target = out.files[item["File ID"].trim()];
    if (!target) continue;
    const examples = item["Example value(s)"];
    const distractor: KeyDistractor = {
      where: item["Where"],
      what: item["What it is"],
      examples,
      numbers: parseNumbers(examples),
      failureMode: item["Failure mode if stored"],
    };
    target.distractors.push(distractor);
  }
  return out;
}

if (process.argv[1] && process.argv[1].includes("export-answer-keys")) {
  const [workbook, output] = process.argv.slice(2);
  if (!workbook || !output) {
    console.error("Usage: export-answer-keys.ts <workbook.xlsx> <out.json>");
    process.exit(1);
  }
  exportAnswerKeys(workbook).then((data) => {
    writeFileSync(output, JSON.stringify(data, null, 1));
    for (const file of Object.values(data.files)) {
      console.log(
        file.id,
        file.city,
        file.year,
        `${file.rows.length} key rows`,
      );
    }
  });
}
