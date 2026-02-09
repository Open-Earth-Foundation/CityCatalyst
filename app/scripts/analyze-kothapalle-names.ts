/**
 * One-off: extract unique sector/subsector names from Kothapalle eCRF and
 * print them with suggested canonical slugs. No app imports.
 * Usage: npx tsx scripts/analyze-kothapalle-names.ts
 */
import * as fs from "fs";
import * as path from "path";
import Excel from "exceljs";

const APP_ROOT = process.cwd();
const FILE_PATH = path.join(
  APP_ROOT,
  "src",
  "util",
  "GHGI",
  "data",
  "A_Kothapalle_CRF_2013_GPC_Filled_ALL_Sheet3.xlsx",
);
const REF_TABLE_PATH = path.join(APP_ROOT, "src", "util", "GHGI", "data", "gpc-reference-table.json");

function findColIndex(headers: string[], terms: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").toLowerCase();
    for (const t of terms) {
      if (h.includes(t.toLowerCase())) return i;
    }
  }
  return -1;
}

function normalizeSlug(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error("File not found:", FILE_PATH);
    process.exit(1);
  }
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(fs.readFileSync(FILE_PATH) as any);
  let sheet: Excel.Worksheet | null = null;
  let headers: string[] = [];
  let headerRowNum = 1;
  for (const ws of workbook.worksheets) {
    for (let hr = 1; hr <= Math.min(15, ws.rowCount || 0); hr++) {
      const row = ws.getRow(hr);
      const rowHeaders: string[] = [];
      for (let c = 1; c <= (ws.columnCount || 80); c++) {
        rowHeaders.push(row.getCell(c).value?.toString?.()?.trim() || "");
      }
      const sectorIdx = findColIndex(rowHeaders, ["crf - sector", "sector"]);
      const subsectorIdx = findColIndex(rowHeaders, ["crf - sub-sector", "sub-sector", "subsector"]);
      if (sectorIdx >= 0 && subsectorIdx >= 0) {
        sheet = ws;
        headers = rowHeaders;
        headerRowNum = hr;
        break;
      }
    }
    if (sheet) break;
  }
  if (!sheet) {
    console.error("No sheet with sector/subsector columns found. Sheets:", workbook.worksheets.map((s) => s.name));
    process.exit(1);
  }
  const sectorIdx = findColIndex(headers, ["crf - sector", "sector"]);
  const subsectorIdx = findColIndex(headers, ["crf - sub-sector", "sub-sector", "subsector"]);
  if (sectorIdx < 0 || subsectorIdx < 0) {
    console.error("Sector or subsector column not found. Headers:", headers.filter(Boolean));
    process.exit(1);
  }
  const sectors = new Set<string>();
  const subsectors = new Set<string>();
  const maxRows = Math.min((sheet.rowCount || 500), 500);
  for (let r = headerRowNum + 1; r <= maxRows; r++) {
    const row = sheet.getRow(r);
    const s = row.getCell(sectorIdx + 1).value?.toString?.()?.trim();
    const ss = row.getCell(subsectorIdx + 1).value?.toString?.()?.trim();
    if (s) sectors.add(s);
    if (ss) subsectors.add(ss);
  }
  const table: { sector: string; subsector: string }[] = JSON.parse(
    fs.readFileSync(REF_TABLE_PATH, "utf-8"),
  );
  const sectorSlugs = [...new Set(table.map((x) => x.sector))];
  const subsectorSlugs = [...new Set(table.map((x) => x.subsector))];
  const romanMap: Record<string, string> = {
    I: "stationary-energy",
    II: "transportation",
    III: "waste",
    IV: "industrial-processes-and-product-uses-ippu",
    V: "agriculture-forestry-and-other-land-use-afolu",
  };
  function suggestSector(v: string): string | null {
    const slug = normalizeSlug(v);
    const bySlug = sectorSlugs.find((s) => normalizeSlug(s) === slug);
    if (bySlug) return bySlug;
    const r = v.trim().toUpperCase();
    return romanMap[r] ?? null;
  }
  function suggestSubsector(v: string): string | null {
    const slug = normalizeSlug(v);
    return subsectorSlugs.find((s) => normalizeSlug(s) === slug) ?? null;
  }
  const sectorEntries = [...sectors].map((v) => ({ fileValue: v, slug: suggestSector(v) }));
  const subsectorEntries = [...subsectors].map((v) => ({ fileValue: v, slug: suggestSubsector(v) }));
  console.log("Sectors:", sectorEntries.length);
  sectorEntries.forEach((e) => console.log(" ", JSON.stringify(e.fileValue), "->", e.slug || "NO_MATCH"));
  console.log("Subsectors:", subsectorEntries.length);
  subsectorEntries.forEach((e) => console.log(" ", JSON.stringify(e.fileValue), "->", e.slug || "NO_MATCH"));
  const outputPath = path.join(APP_ROOT, "scripts", "kothapalle-names-output.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ sectors: sectorEntries, subsectors: subsectorEntries }, null, 2),
    "utf-8",
  );
  console.log("\nWrote", outputPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
