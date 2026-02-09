/**
 * One-off script to analyze an XLSX file structure (sheet names, headers, sample rows)
 * Usage: npx tsx scripts/analyze-xlsx-structure.ts "path/to/file.xlsx"
 */
import * as fs from "fs";
import * as path from "path";
import Excel from "exceljs";

const defaultPath =
  "src/util/GHGI/data/BIOMATEC_Municipalidad de Belén_Inventario GEI 2021.xlsx";
const filePath = process.argv[2] || defaultPath;

async function main() {
  let fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    // Fallback: search in GHGI data folder for BIOMATEC files
    const dataDir = path.resolve(process.cwd(), "src/util/GHGI/data");
    if (fs.existsSync(dataDir)) {
      const files = fs
        .readdirSync(dataDir)
        .filter((f) => f.endsWith(".xlsx") && f.includes("BIOMATEC"));
      if (files.length > 0) {
        fullPath = path.join(dataDir, files[0]);
        console.log("Using found file:", fullPath);
      }
    }
  }
  if (!fs.existsSync(fullPath)) {
    console.error("File not found:", fullPath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(fullPath);
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(buffer as any);

  console.log("=== BIOMATEC / Non-eCRF XLSX Structure Analysis ===\n");
  console.log("File:", filePath);
  console.log("Sheets:", workbook.worksheets.map((ws) => ws.name).join(", "));
  console.log("");

  for (const worksheet of workbook.worksheets) {
    console.log(`\n--- Sheet: "${worksheet.name}" ---`);
    console.log("Row count:", worksheet.rowCount);
    console.log("Column count:", worksheet.columnCount);

    // Try multiple rows as potential header row (BIOMATEC may have section headers in row 1)
    const maxHeaderRow = Math.min(15, worksheet.rowCount);
    const headerList: string[] = [];
    for (let hr = 1; hr <= maxHeaderRow; hr++) {
      const row = worksheet.getRow(hr);
      const vals: string[] = [];
      for (let c = 1; c <= worksheet.columnCount; c++) {
        const cell = row.getCell(c);
        vals.push(cell.value?.toString?.()?.trim() || "");
      }
      const nonEmpty = vals.filter(Boolean).length;
      if (nonEmpty >= 3) {
        headerList.push(...vals.filter(Boolean));
        break;
      }
    }
    if (headerList.length === 0) {
      const headerRow = worksheet.getRow(1);
      for (let c = 1; c <= worksheet.columnCount; c++) {
        const cell = headerRow.getCell(c);
        const val = cell.value?.toString?.()?.trim();
        if (val) headerList.push(val);
        else headerList.push(`Col${c}`);
      }
    }
    console.log("\nHeaders (" + headerList.length + "):");
    headerList.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

    // Sample first 3 data rows
    const sampleRows = Math.min(3, Math.max(0, worksheet.rowCount - 1));
    if (sampleRows > 0 && headerList.length > 1) {
      console.log("\nSample rows (first " + sampleRows + "):");
      for (let r = 2; r <= 2 + sampleRows - 1; r++) {
        const row = worksheet.getRow(r);
        const rowData: Record<string, string> = {};
        headerList.forEach((header, idx) => {
          const colNum = idx + 1;
          const cell = row.getCell(colNum);
          rowData[header] = cell.value != null ? String(cell.value) : "(empty)";
        });
        console.log("  Row " + r + ":", JSON.stringify(rowData, null, 2));
      }
    }

    // Raw grid dump for key emission sheets (BIOMATEC uses non-standard layout)
    const rawDumpSheets = [
      "2.1. Energía estacionaria",
      "3. Emisiones netas",
      "2.2. Transporte",
    ];
    if (rawDumpSheets.includes(worksheet.name)) {
      console.log("\n  [Raw grid - first 25 rows x 12 cols]:");
      const maxR = Math.min(25, worksheet.rowCount);
      const maxC = Math.min(12, worksheet.columnCount);
      for (let r = 1; r <= maxR; r++) {
        const row = worksheet.getRow(r);
        const parts: string[] = [];
        for (let c = 1; c <= maxC; c++) {
          const v = row.getCell(c).value;
          const s = v != null ? String(v).slice(0, 25) : "";
          parts.push(s || "·");
        }
        console.log("    R" + r + ": " + parts.join(" | "));
      }
    }
  }

  console.log("\n=== Analysis complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
