import gpcReferenceTable from "./data/gpc-reference-table.json";
import nameMappings from "./data/gpc-name-mappings.json";
import { GPCReferenceRow } from "@/../scripts/generate-gpc-reference-table";

const table = gpcReferenceTable as GPCReferenceRow[];

export interface GPCNameMappings {
  sector: Record<string, string>;
  subsector: Record<string, string>;
}
const mappings = nameMappings as GPCNameMappings;

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
 * Map a file value to canonical sector or subsector slug using gpc-name-mappings.json.
 * Falls back to normalizeToSlug when no mapping exists.
 */
function mapToCanonicalSlug(
  type: "sector" | "subsector",
  fileValue: string,
): string {
  const trimmed = fileValue.trim();
  const lower = trimmed.toLowerCase();
  const map = type === "sector" ? mappings.sector : mappings.subsector;
  if (map[trimmed]) return map[trimmed];
  if (map[lower]) return map[lower];
  return normalizeToSlug(fileValue);
}

/**
 * Normalize raw sector and subsector names (e.g. from PDF/LLM extraction) to canonical
 * slugs used in the GPC reference table. Use when gpcRefNo is absent to improve matching.
 */
export function normalizeSectorAndSubsector(
  sector: string,
  subsector: string,
): { sectorSlug: string; subsectorSlug: string } {
  return {
    sectorSlug: mapToCanonicalSlug("sector", sector),
    subsectorSlug: mapToCanonicalSlug("subsector", subsector),
  };
}

/**
 * Split combined "Sector > Sub-sector" labels from eCRF-style files into separate values.
 */
export function splitSectorSubsectorLabels(
  sector: string,
  subsector: string,
): { sector: string; subsector: string } {
  let parsedSector = sector.trim();
  let parsedSubsector = subsector.trim();

  if (parsedSector.includes(" > ")) {
    const [left, right] = parsedSector.split(" > ").map((s) => s.trim());
    if (left && right) {
      parsedSector = left;
      if (!parsedSubsector) parsedSubsector = right;
    }
  }

  if (parsedSubsector.includes(" > ")) {
    const [left, right] = parsedSubsector.split(" > ").map((s) => s.trim());
    if (left && right) {
      if (!parsedSector) parsedSector = left;
      parsedSubsector = right;
    }
  }

  return { sector: parsedSector, subsector: parsedSubsector };
}

/**
 * CRF scope words are not GPC subcategory names. "Indirect" is checked before
 * "direct" because the word indirect contains "direct".
 */
export function scopeFromLabel(scopeLabel?: string | null): number | undefined {
  if (scopeLabel == null) return undefined;
  const label = scopeLabel.trim().toLowerCase();
  if (!label) return undefined;
  if (label === "2" || label === "scope 2" || label.includes("indirect")) {
    return 2;
  }
  if (label === "1" || label === "scope 1" || label.includes("direct")) {
    return 1;
  }
  if (label === "3" || label === "scope 3") return 3;
  return undefined;
}

/** CRF sector label for generation supplied to the grid, not a GPC sector name. */
function isEnergyGenerationSector(sector: string): boolean {
  return /energy\s*generation/i.test(sector);
}

/**
 * Table options are prefixed (`fuel-type-natural-gas`, `energy-usage-electricity`).
 * File values are the bare name (`Natural gas`, `Electricity`).
 */
function fuelOptionMatches(option: string, activitySlug: string): boolean {
  const optionSlug = normalizeToSlug(option);
  if (optionSlug === activitySlug) return true;
  const stripped = optionSlug.replace(/^(fuel-type|energy-usage|type)-/, "");
  return stripped.length > 0 && stripped === activitySlug;
}

/**
 * Resolve GPC reference number from sector + subsector + optional fuel and scope.
 * Use when the eCRF file has no GPC ref no column or a row has an empty ref.
 *
 * A scope label selects I.x.1 / I.x.2 / I.x.3. When the label is present and
 * nothing has that scope, this returns null instead of the first (scope 1) row.
 * With no scope label, the previous first-match behaviour is kept.
 *
 * @param sector - Sector name from file (will be normalized to slug)
 * @param subsector - Subsector name from file (will be normalized to slug)
 * @param fuelTypeOrActivity - Optional activity/fuel type from file
 * @param scopeLabel - Optional CRF scope ("Direct emissions", "Indirect emissions", or "1"/"2"/"3")
 * @returns gpcRefNo, or null if none
 */
export function resolveGpcRefNo(
  sector: string,
  subsector: string,
  fuelTypeOrActivity?: string,
  scopeLabel?: string | null,
): string | null {
  const scope = scopeFromLabel(scopeLabel);
  // "Energy generation" is I.4.4 (supplied to the grid). I.4.1 is only auxiliary
  // fuel use at the plant, so a scope-1 filter would store generation in the wrong row.
  const suppliedToGrid =
    fuelTypeOrActivity != null &&
    /supplied\s+to\s+(the\s+)?grid/i.test(fuelTypeOrActivity);
  if (isEnergyGenerationSector(sector) || suppliedToGrid) {
    if (scope === 2) return "I.4.2";
    if (scope === 3) return "I.4.3";
    return "I.4.4";
  }

  const sectorSlug = mapToCanonicalSlug("sector", sector);
  const subsectorSlug = mapToCanonicalSlug("subsector", subsector);
  const activitySlug =
    fuelTypeOrActivity != null && fuelTypeOrActivity !== ""
      ? normalizeToSlug(fuelTypeOrActivity)
      : undefined;

  let matches = table.filter(
    (row) =>
      normalizeToSlug(row.sector) === sectorSlug &&
      normalizeToSlug(row.subsector) === subsectorSlug,
  );

  if (matches.length === 0) {
    return null;
  }

  if (scope != null) {
    const scoped = matches.filter((row) => row.scope === scope);
    if (scoped.length === 0) return null;
    matches = scoped;
  }

  if (matches.length === 1) {
    return matches[0].gpcRefNo;
  }
  // Several rows share this scope (or no scope was given). Fuel breaks the tie.
  if (activitySlug) {
    const withActivity = matches.find((row) =>
      row.fuelTypeOrActivity.some((opt) =>
        fuelOptionMatches(opt, activitySlug),
      ),
    );
    if (withActivity) {
      return withActivity.gpcRefNo;
    }
  }
  return matches[0].gpcRefNo;
}

const GENERATED_OUTSIDE_TREATED_INSIDE =
  /\b(generated|produced|originating)\b.*\boutside\b.*\b(treated|disposed|processed|incinerated|landfilled)\b.*\b(within|inside|in)\b|\bimported waste/i;
const GENERATED_INSIDE_TREATED_OUTSIDE =
  /\b(generated|produced|originating)\b.*\b(within|inside|in)\b.*\b(treated|disposed|processed|incinerated|landfilled)\b.*\boutside\b|\bexported waste/i;

/**
 * Corrects a waste reference when a row's label states the direction. III.x.2 is
 * generated inside and treated outside; III.x.3 is generated outside and treated
 * inside, and leaves BASIC totals, so a wrong .3 drops an amount from the total.
 * Scope cannot separate them: .3 is scope 1 like .1. Rows with no direction in
 * their label keep their reference.
 */
export function correctWasteDirection(
  gpcRefNo: string,
  labels: (string | null | undefined)[],
): string {
  const match = gpcRefNo.match(/^(III\.[1-4])\.[123]$/);
  if (!match) return gpcRefNo;
  const label = labels.filter(Boolean).join(" ");
  if (GENERATED_OUTSIDE_TREATED_INSIDE.test(label)) return `${match[1]}.3`;
  if (GENERATED_INSIDE_TREATED_OUTSIDE.test(label)) return `${match[1]}.2`;
  return gpcRefNo;
}

/**
 * Resolve a missing GPC ref from the raw sector, sub-sector, fuel, and scope
 * labels, including "On-road > Passenger car" style splits.
 */
export function resolveGpcRefFromLabels(input: {
  sector?: string | null;
  subsector?: string | null;
  fuelTypeOrActivity?: string | null;
  scopeLabel?: string | null;
}): string | null {
  const rawSector = input.sector?.trim() ?? "";
  const rawSubsector = input.subsector?.trim() ?? "";
  const fuel = input.fuelTypeOrActivity?.trim() || undefined;
  const scopeLabel = input.scopeLabel?.trim() || undefined;
  const { sector, subsector } = splitSectorSubsectorLabels(
    rawSector,
    rawSubsector,
  );

  let resolved =
    sector && subsector
      ? resolveGpcRefNo(sector, subsector, fuel, scopeLabel)
      : resolveGpcRefNo(rawSector, rawSubsector, fuel, scopeLabel);

  // "Rail > Other/uncategorized" keeps the right-hand label, which is not a GPC sub-sector.
  if (!resolved && rawSubsector.includes(" > ")) {
    const leftPart = rawSubsector.split(" > ")[0].trim();
    if (leftPart && leftPart !== subsector) {
      resolved = resolveGpcRefNo(
        sector || rawSector,
        leftPart,
        fuel,
        scopeLabel,
      );
    }
  }
  if (!resolved && rawSector.includes(" > ")) {
    const leftPart = rawSector.split(" > ")[0].trim();
    if (leftPart && leftPart !== sector) {
      resolved = resolveGpcRefNo(
        leftPart,
        subsector || rawSubsector,
        fuel,
        scopeLabel,
      );
    }
  }
  return resolved && correctWasteDirection(resolved, [rawSubsector, fuel]);
}
