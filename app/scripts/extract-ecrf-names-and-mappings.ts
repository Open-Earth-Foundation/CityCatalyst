/**
 * Extracts unique sector, subsector, and activity type values from an eCRF file
 * and suggests canonical slug mappings so missing names can be resolved.
 *
 * Usage (from app directory):
 *   npx tsx scripts/extract-ecrf-names-and-mappings.ts <path-to-ecrf.xlsx>
 *   npx tsx scripts/extract-ecrf-names-and-mappings.ts src/util/GHGI/data/A_Kothapalle_CRF_2013_GPC_Filled_ALL_Sheet3.xlsx
 *
 * Output: prints unique values and suggested mappings; with --write merges into
 *   src/util/GHGI/data/gpc-name-mappings.json
 */

import * as fs from "fs";
import * as path from "path";
import FileParserService from "../src/backend/FileParserService";

const APP_ROOT = process.cwd();
const REF_TABLE_PATH = path.join(
  APP_ROOT,
  "src",
  "util",
  "GHGI",
  "data",
  "gpc-reference-table.json",
);
const MAPPINGS_PATH = path.join(
  APP_ROOT,
  "src",
  "util",
  "GHGI",
  "data",
  "gpc-name-mappings.json",
);

function normalizeToSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function detectColumnIndex(headers: string[], terms: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const normTerms = terms.map((t) => t.toLowerCase().trim());
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    for (const term of normTerms) {
      if (h === term || (h && h.includes(term))) return i;
    }
  }
  return -1;
}

interface ExtractionResult {
  sectors: { fileValue: string; suggestedSlug: string | null }[];
  subsectors: { fileValue: string; suggestedSlug: string | null }[];
  activities: { fileValue: string }[];
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const writeMappings = process.argv.includes("--write");
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Usage: npx tsx scripts/extract-ecrf-names-and-mappings.ts <ecrf-file.xlsx> [--write]");
    console.error("  --write  Merge suggested mappings into gpc-name-mappings.json");
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "") as "xlsx" | "csv";
  const fileType = ext === "csv" ? "csv" : "xlsx";
  const parsed = await FileParserService.parseFile(buffer, fileType);
  const sheet = parsed.primarySheet;
  if (!sheet || sheet.rows.length === 0) {
    console.error("No data sheet or empty sheet");
    process.exit(1);
  }

  const headers = sheet.headers;
  const sectorIdx = detectColumnIndex(headers, ["crf - sector", "sector", "crf sector"]);
  const subsectorIdx = detectColumnIndex(headers, [
    "crf - sub-sector",
    "subsector",
    "sub-sector",
    "crf sub-sector",
  ]);
  const activityIdx = detectColumnIndex(headers, [
    "activity type",
    "activity_type",
    "fuel type",
    "fuel_type",
  ]);

  const sectorValues = new Set<string>();
  const subsectorValues = new Set<string>();
  const activityValues = new Set<string>();

  for (const row of sheet.rows) {
    const sectorHeader = sectorIdx >= 0 ? headers[sectorIdx] : null;
    const subsectorHeader = subsectorIdx >= 0 ? headers[subsectorIdx] : null;
    const activityHeader = activityIdx >= 0 ? headers[activityIdx] : null;
    if (sectorHeader) {
      const v = row[sectorHeader]?.toString?.()?.trim();
      if (v) sectorValues.add(v);
    }
    if (subsectorHeader) {
      const v = row[subsectorHeader]?.toString?.()?.trim();
      if (v) subsectorValues.add(v);
    }
    if (activityHeader) {
      const v = row[activityHeader]?.toString?.()?.trim();
      if (v) activityValues.add(v);
    }
  }

  const table: { sector: string; subsector: string; fuelTypeOrActivity: string[] }[] = JSON.parse(
    fs.readFileSync(REF_TABLE_PATH, "utf-8"),
  );
  const sectorSlugs = [...new Set(table.map((r) => r.sector))];
  const subsectorSlugs = [...new Set(table.map((r) => r.subsector))];

  function suggestSector(fileValue: string): string | null {
    const slug = normalizeToSlug(fileValue);
    const match = sectorSlugs.find((s) => normalizeToSlug(s) === slug);
    if (match) return match;
    if (/^[ivx]+$/i.test(fileValue.trim())) {
      const roman = fileValue.trim().toUpperCase();
      const map: Record<string, string> = {
        I: "stationary-energy",
        II: "transportation",
        III: "waste",
        IV: "industrial-processes-and-product-uses-ippu",
        V: "agriculture-forestry-and-other-land-use-afolu",
      };
      return map[roman] ?? null;
    }
    return null;
  }
  function suggestSubsector(fileValue: string): string | null {
    const slug = normalizeToSlug(fileValue);
    return subsectorSlugs.find((s) => normalizeToSlug(s) === slug) ?? null;
  }

  const result: ExtractionResult = {
    sectors: [...sectorValues].map((v) => ({ fileValue: v, suggestedSlug: suggestSector(v) })),
    subsectors: [...subsectorValues].map((v) => ({ fileValue: v, suggestedSlug: suggestSubsector(v) })),
    activities: [...activityValues].map((v) => ({ fileValue: v })),
  };

  console.log("=== Unique values in file ===\n");
  console.log("Sectors:", result.sectors.length);
  result.sectors.forEach((s) =>
    console.log(`  "${s.fileValue}" -> ${s.suggestedSlug ?? "NO_MATCH"}`),
  );
  console.log("\nSubsectors:", result.subsectors.length);
  result.subsectors.forEach((s) =>
    console.log(`  "${s.fileValue}" -> ${s.suggestedSlug ?? "NO_MATCH"}`),
  );
  console.log("\nActivity/Fuel types:", result.activities.length);
  result.activities.forEach((a) => console.log(`  "${a.fileValue}"`));

  const existing: { sector: Record<string, string>; subsector: Record<string, string> } = fs.existsSync(
    MAPPINGS_PATH,
  )
    ? JSON.parse(fs.readFileSync(MAPPINGS_PATH, "utf-8"))
    : { sector: {}, subsector: {} };

  const toMerge: { sector: Record<string, string>; subsector: Record<string, string> } = {
    sector: {},
    subsector: {},
  };
  result.sectors.forEach((s) => {
    if (s.suggestedSlug && s.fileValue) toMerge.sector[s.fileValue] = s.suggestedSlug;
  });
  result.subsectors.forEach((s) => {
    if (s.suggestedSlug && s.fileValue) toMerge.subsector[s.fileValue] = s.suggestedSlug;
  });

  if (writeMappings) {
    const merged = {
      sector: { ...existing.sector, ...toMerge.sector },
      subsector: { ...existing.subsector, ...toMerge.subsector },
    };
    fs.writeFileSync(MAPPINGS_PATH, JSON.stringify(merged, null, 2), "utf-8");
    console.log("\nMerged suggested mappings into", MAPPINGS_PATH);
  } else if (
    result.sectors.some((s) => !s.suggestedSlug) ||
    result.subsectors.some((s) => !s.suggestedSlug)
  ) {
    console.log("\nAdd --write to merge suggested mappings into gpc-name-mappings.json");
    console.log("Add manual entries in gpc-name-mappings.json for NO_MATCH values.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
