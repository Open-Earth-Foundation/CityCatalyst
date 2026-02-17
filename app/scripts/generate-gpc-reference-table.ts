/**
 * Generates a GPC reference table (gpcRefNo, sector, subsector, fuel/activity type)
 * from inventory-structure.json and manual-input-hierarchy.json.
 * Use this table when ECRF files do not contain GPC ref no: look up or validate
 * by sector + subsector + fuel/activity.
 *
 * Inputs:
 *   - src/data/inventory-structure.json
 *   - src/util/form-schema/manual-input-hierarchy.json
 * Output:
 *   - src/util/GHGI/data/gpc-reference-table.json
 *
 * Usage (from app directory):
 *   npx tsx scripts/generate-gpc-reference-table.ts
 */

import * as fs from "fs";
import * as path from "path";

// When run as: npx tsx scripts/generate-gpc-reference-table.ts (from app/), cwd is app
const APP_ROOT = process.cwd();
const INVENTORY_STRUCTURE_PATH = path.join(
  APP_ROOT,
  "src",
  "data",
  "inventory-structure.json",
);
const MANUAL_HIERARCHY_PATH = path.join(
  APP_ROOT,
  "src",
  "util",
  "form-schema",
  "manual-input-hierarchy.json",
);
const OUTPUT_PATH = path.join(
  APP_ROOT,
  "src",
  "util",
  "GHGI",
  "data",
  "gpc-reference-table.json",
);

interface SubCategoryEntry {
  referenceNumber: string | null;
  subcategoryName?: string | null;
  activityName?: string | null;
}

interface SubSectorEntry {
  referenceNumber: string | null;
  subsectorName?: string | null;
  subCategories: SubCategoryEntry[];
}

interface SectorEntry {
  referenceNumber: string | null;
  sectorName?: string | null;
  subSectors: SubSectorEntry[];
}

export interface GPCReferenceRow {
  gpcRefNo: string;
  sector: string;
  subsector: string;
  subcategoryName: string | null;
  scope?: number;
  /** Possible fuel types or activity types for this GPC ref (from methodologies) */
  fuelTypeOrActivity: string[];
}

function collectActivityOptions(node: Record<string, unknown>): string[] {
  const options: string[] = [];
  if (Array.isArray(node.options)) {
    options.push(...(node.options as string[]));
  }
  const extraFields = node["extra-fields"];
  if (extraFields && Array.isArray(extraFields)) {
    for (const field of extraFields as Record<string, unknown>[]) {
      options.push(...collectActivityOptions(field));
    }
  }
  if (node.activities && Array.isArray(node.activities)) {
    for (const act of node.activities as Record<string, unknown>[]) {
      options.push(...collectActivityOptions(act));
    }
  }
  const directMeasure = node.directMeasure;
  if (directMeasure && typeof directMeasure === "object") {
    options.push(
      ...collectActivityOptions(directMeasure as Record<string, unknown>),
    );
  }
  return options;
}

function getFuelOrActivityForRef(
  hierarchy: Record<
    string,
    { methodologies?: unknown[]; directMeasure?: unknown }
  >,
  gpcRefNo: string,
): string[] {
  const entry = hierarchy[gpcRefNo];
  if (!entry) return [];
  const options: string[] = [];
  if (entry.methodologies && Array.isArray(entry.methodologies)) {
    for (const m of entry.methodologies) {
      options.push(...collectActivityOptions(m as Record<string, unknown>));
    }
  }
  if (entry.directMeasure && typeof entry.directMeasure === "object") {
    options.push(
      ...collectActivityOptions(entry.directMeasure as Record<string, unknown>),
    );
  }
  return [...new Set(options)];
}

function main(): void {
  if (!fs.existsSync(INVENTORY_STRUCTURE_PATH)) {
    console.error("Inventory structure not found:", INVENTORY_STRUCTURE_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(MANUAL_HIERARCHY_PATH)) {
    console.error("Manual hierarchy not found:", MANUAL_HIERARCHY_PATH);
    process.exit(1);
  }

  const inventoryStructure: SectorEntry[] = JSON.parse(
    fs.readFileSync(INVENTORY_STRUCTURE_PATH, "utf-8"),
  );
  const manualHierarchy: Record<
    string,
    { scope?: number; methodologies?: unknown[]; directMeasure?: unknown }
  > = JSON.parse(fs.readFileSync(MANUAL_HIERARCHY_PATH, "utf-8"));

  const validSectorRefs = ["I", "II", "III", "IV", "V"];
  const rows: GPCReferenceRow[] = [];

  for (const sector of inventoryStructure) {
    const refNo = sector.referenceNumber;
    if (!refNo || !validSectorRefs.includes(refNo)) continue;

    const sectorName = sector.sectorName ?? refNo;

    for (const subSector of sector.subSectors) {
      const subRefNo = subSector.referenceNumber;
      const subsectorName = subSector.subsectorName ?? subRefNo ?? "";

      if (subSector.subCategories.length > 0) {
        for (const subCat of subSector.subCategories) {
          const gpcRefNo = subCat.referenceNumber;
          if (!gpcRefNo) continue;
          const fuelOrActivity = getFuelOrActivityForRef(
            manualHierarchy,
            gpcRefNo,
          );
          const scope = manualHierarchy[gpcRefNo]?.scope;
          rows.push({
            gpcRefNo,
            sector: sectorName,
            subsector: subsectorName,
            subcategoryName: subCat.subcategoryName ?? null,
            ...(scope !== undefined && { scope }),
            fuelTypeOrActivity: fuelOrActivity,
          });
        }
      } else {
        const gpcRefNo = subRefNo ?? "";
        if (!gpcRefNo) continue;
        const fuelOrActivity = getFuelOrActivityForRef(
          manualHierarchy,
          gpcRefNo,
        );
        const scope = manualHierarchy[gpcRefNo]?.scope;
        rows.push({
          gpcRefNo,
          sector: sectorName,
          subsector: subsectorName,
          subcategoryName: null,
          ...(scope !== undefined && { scope }),
          fuelTypeOrActivity: fuelOrActivity,
        });
      }
    }
  }

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(rows, null, 2), "utf-8");
  console.log("Wrote", rows.length, "rows to", OUTPUT_PATH);
}

main();
