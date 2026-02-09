import gpcReferenceTable from "./data/gpc-reference-table.json";
import type { GPCReferenceRow } from "./types";

const table = gpcReferenceTable as GPCReferenceRow[];

/**
 * Normalize a file value (e.g. "Stationary Energy", "Residential buildings")
 * to a slug for matching the GPC reference table (e.g. "stationary-energy").
 */
export function normalizeToSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Resolve GPC reference number from sector + subsector + optional fuel/activity.
 * Use when the eCRF file has no GPC ref no column or a row has an empty ref.
 *
 * @param sector - Sector name from file (will be normalized to slug)
 * @param subsector - Subsector name from file (will be normalized to slug)
 * @param fuelTypeOrActivity - Optional activity/fuel type from file (matched against table options)
 * @returns gpcRefNo if exactly one match, or first match when multiple; null if none
 */
export function resolveGpcRefNo(
  sector: string,
  subsector: string,
  fuelTypeOrActivity?: string,
): string | null {
  const sectorSlug = normalizeToSlug(sector);
  const subsectorSlug = normalizeToSlug(subsector);
  const activitySlug =
    fuelTypeOrActivity != null && fuelTypeOrActivity !== ""
      ? normalizeToSlug(fuelTypeOrActivity)
      : undefined;

  const matches = table.filter(
    (row) =>
      normalizeToSlug(row.sector) === sectorSlug &&
      normalizeToSlug(row.subsector) === subsectorSlug,
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0].gpcRefNo;
  }
  // Multiple subcategories (e.g. I.1.1, I.1.2, I.1.3) – use activity/fuel to disambiguate
  if (activitySlug) {
    const withActivity = matches.find((row) =>
      row.fuelTypeOrActivity.some(
        (opt) => normalizeToSlug(opt) === activitySlug || opt === activitySlug,
      ),
    );
    if (withActivity) {
      return withActivity.gpcRefNo;
    }
  }
  // Return first match (e.g. scope 1) when we can't disambiguate
  return matches[0].gpcRefNo;
}
