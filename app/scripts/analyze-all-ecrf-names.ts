/**
 * Extract unique sector/subsector names from multiple eCRF files and merge
 * new mappings into gpc-name-mappings.json. No app imports.
 *
 * Usage (from app directory):
 *   npx tsx scripts/analyze-all-ecrf-names.ts
 *   npx tsx scripts/analyze-all-ecrf-names.ts path/to/file1.xlsx path/to/file2.xlsx
 */
import * as fs from "fs";
import * as path from "path";
import Excel from "exceljs";

const APP_ROOT = process.cwd();
const DATA_DIR = path.join(APP_ROOT, "src", "util", "GHGI", "data");
const REF_TABLE_PATH = path.join(DATA_DIR, "gpc-reference-table.json");
const MAPPINGS_PATH = path.join(DATA_DIR, "gpc-name-mappings.json");

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

interface FileResult {
  file: string;
  sectors: string[];
  subsectors: string[];
}

async function extractFromFile(filePath: string): Promise<FileResult | null> {
  if (!fs.existsSync(filePath)) return null;
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(fs.readFileSync(filePath) as any);
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
  if (!sheet) return null;
  const sectorIdx = findColIndex(headers, ["crf - sector", "sector"]);
  const subsectorIdx = findColIndex(headers, ["crf - sub-sector", "sub-sector", "subsector"]);
  if (sectorIdx < 0 || subsectorIdx < 0) return null;
  const sectors = new Set<string>();
  const subsectors = new Set<string>();
  const maxRows = Math.min(sheet.rowCount || 2000, 2000);
  for (let r = headerRowNum + 1; r <= maxRows; r++) {
    const row = sheet.getRow(r);
    const s = row.getCell(sectorIdx + 1).value?.toString?.()?.trim();
    const ss = row.getCell(subsectorIdx + 1).value?.toString?.()?.trim();
    if (s) {
      if (s.includes(" > ")) {
        const [left, right] = s.split(" > ").map((x: string) => x.trim());
        if (left) sectors.add(left);
        if (right) subsectors.add(right);
      } else {
        sectors.add(s);
      }
    }
    if (ss) {
      if (ss.includes(" > ")) {
        const [left, right] = ss.split(" > ").map((x: string) => x.trim());
        if (left) sectors.add(left);
        if (right) subsectors.add(right);
      } else {
        subsectors.add(ss);
      }
    }
  }
  return {
    file: path.basename(filePath),
    sectors: [...sectors],
    subsectors: [...subsectors],
  };
}

function suggestSector(
  v: string,
  sectorSlugs: string[],
  romanMap: Record<string, string>,
): string | null {
  const slug = normalizeSlug(v);
  const bySlug = sectorSlugs.find((s) => normalizeSlug(s) === slug);
  if (bySlug) return bySlug;
  const r = v.trim().toUpperCase();
  return romanMap[r] ?? null;
}

function suggestSubsector(v: string, subsectorSlugs: string[]): string | null {
  const slug = normalizeSlug(v);
  return subsectorSlugs.find((s) => normalizeSlug(s) === slug) ?? null;
}

async function main() {
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

  const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const filesToProcess: string[] =
    fileArgs.length > 0
      ? fileArgs.map((f) => (path.isAbsolute(f) ? f : path.join(process.cwd(), f)))
      : [
          path.join(DATA_DIR, "Abaiara_CRFFormat_2023_20260206.xlsx"),
          path.join(DATA_DIR, "Brasília_CRFFormat_2023_20260202.xlsx"),
          path.join(DATA_DIR, "New York City_CRFFormat_2015_20260206.xlsx"),
          path.join(DATA_DIR, "Rio de Janeiro_CRFFormat_2023_20260206.xlsx"),
          path.join(DATA_DIR, "Rio Negro_CRFFormat_2023_20260206.xlsx"),
          path.join(DATA_DIR, "BIOMATEC_Municipalidad de Belén_Inventario GEI 2021.xlsx"),
        ];

  const allSectors = new Set<string>();
  const allSubsectors = new Set<string>();
  for (const filePath of filesToProcess) {
    if (!fs.existsSync(filePath)) {
      console.warn("Skip (not found):", filePath);
      continue;
    }
    const result = await extractFromFile(filePath);
    if (!result) {
      console.warn("Skip (no sector/subsector columns):", path.basename(filePath));
      continue;
    }
    console.log("OK:", result.file, "- sectors:", result.sectors.length, "subsectors:", result.subsectors.length);
    result.sectors.forEach((s) => allSectors.add(s));
    result.subsectors.forEach((s) => allSubsectors.add(s));
  }

  const existing: { sector: Record<string, string>; subsector: Record<string, string> } = fs.existsSync(
    MAPPINGS_PATH,
  )
    ? JSON.parse(fs.readFileSync(MAPPINGS_PATH, "utf-8"))
    : { sector: {}, subsector: {} };

  const toAddSector: Record<string, string> = {};
  const toAddSubsector: Record<string, string> = {};
  const noMatchSector: string[] = [];
  const noMatchSubsector: string[] = [];
  for (const v of allSectors) {
    if (!v || v.startsWith("Total") || v === "Sectors and Sub-Sectors") continue;
    const slug = suggestSector(v, sectorSlugs, romanMap);
    if (slug && !existing.sector[v]) toAddSector[v] = slug;
    else if (!slug && !existing.sector[v]) noMatchSector.push(v);
  }
  for (const v of allSubsectors) {
    if (!v || v.startsWith("Total") || v === "Sectors and Sub-Sectors") continue;
    const slug = suggestSubsector(v, subsectorSlugs);
    if (slug && !existing.subsector[v]) toAddSubsector[v] = slug;
    else if (!slug && !existing.subsector[v]) noMatchSubsector.push(v);
  }

  const merged = {
    sector: { ...existing.sector, ...toAddSector },
    subsector: { ...existing.subsector, ...toAddSubsector },
  };
  fs.writeFileSync(MAPPINGS_PATH, JSON.stringify(merged, null, 2), "utf-8");

  console.log("\nNew sector mappings added:", Object.keys(toAddSector).length);
  Object.entries(toAddSector).forEach(([k, val]) => console.log("  ", JSON.stringify(k), "->", val));
  console.log("New subsector mappings added:", Object.keys(toAddSubsector).length);
  Object.entries(toAddSubsector).forEach(([k, val]) => console.log("  ", JSON.stringify(k), "->", val));
  if (noMatchSector.length > 0 || noMatchSubsector.length > 0) {
    console.log("\nValues with NO_MATCH (add manually to gpc-name-mappings.json if needed):");
    noMatchSector.forEach((v) => console.log("  sector:", JSON.stringify(v)));
    noMatchSubsector.forEach((v) => console.log("  subsector:", JSON.stringify(v)));
  }
  console.log("\nUpdated", MAPPINGS_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
