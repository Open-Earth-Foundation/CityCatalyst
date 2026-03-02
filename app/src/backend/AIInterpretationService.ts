/**
 * Path B: Interpret tabular file columns using the LLM. Suggests a column mapping
 * (target field id → column index) so ECRFImportService can process the file.
 * For key-value format (column headers = composite e.g. residential_buildings_scope_1),
 * shapes the table into GPC rows via LLM so no extra code steps are needed.
 * Uses the same prompt structure as PDF extraction (Path C): <role>, <task>, <input>, <output>, <taxonomy>, <example_output>.
 * Embeds the same GPC schema (sector/subsector hierarchy and name mappings) so the LLM knows what to look for.
 */

import { createLLMClient } from "@/backend/llm";
import { logger } from "@/services/logger";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import gpcNameMappings from "@/util/GHGI/data/gpc-name-mappings.json";

type GpcRow = { sector: string; subsector: string };
const gpcTable = gpcReferenceTable as GpcRow[];

type NameMappings = {
  sector: Record<string, string>;
  subsector: Record<string, string>;
};
const nameMappings = gpcNameMappings as NameMappings;

function slugToDisplay(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** GPC hierarchy: sector (display) → list of subsector (display). Same as PDF extraction. */
const SECTOR_SUBSECTOR_HIERARCHY = (() => {
  const map = new Map<string, string[]>();
  for (const row of gpcTable) {
    const sectorDisplay = slugToDisplay(row.sector);
    const subsectorDisplay = slugToDisplay(row.subsector);
    if (!map.has(sectorDisplay)) map.set(sectorDisplay, []);
    const list = map.get(sectorDisplay)!;
    if (!list.includes(subsectorDisplay)) list.push(subsectorDisplay);
  }
  for (const list of map.values()) list.sort();
  return map;
})();

const SECTOR_VARIANT_TO_CANONICAL = (() => {
  const out: Record<string, string> = {};
  for (const [variant, slug] of Object.entries(nameMappings.sector)) {
    const canonical = slugToDisplay(slug);
    if (variant.trim() && canonical) out[variant] = canonical;
  }
  return out;
})();

const SUBSECTOR_VARIANT_TO_CANONICAL = (() => {
  const out: Record<string, string> = {};
  for (const [variant, slug] of Object.entries(nameMappings.subsector)) {
    const canonical = slugToDisplay(slug);
    if (variant.trim() && canonical) out[variant] = canonical;
  }
  return out;
})();

const HIERARCHY_TEXT = [...SECTOR_SUBSECTOR_HIERARCHY.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([sector, subs]) => `- ${sector}: ${subs.join(", ")}`)
  .join("\n");

const SECTOR_DICTIONARY_TEXT = Object.entries(SECTOR_VARIANT_TO_CANONICAL)
  .filter(([variant]) => variant !== SECTOR_VARIANT_TO_CANONICAL[variant])
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([term, canonical]) => `"${term}" → ${canonical}`)
  .join("; ");

const SUBSECTOR_DICTIONARY_TEXT = Object.entries(SUBSECTOR_VARIANT_TO_CANONICAL)
  .filter(([variant]) => variant !== SUBSECTOR_VARIANT_TO_CANONICAL[variant])
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([term, canonical]) => `"${term}" → ${canonical}`)
  .join("; ");

/** Target field ids that can be mapped (same keys as ECRF detectedColumns). */
export const INTERPRETATION_TARGET_FIELDS = [
  "gpcRefNo",
  "sector",
  "subsector",
  "scope",
  "year",
  "co2",
  "ch4",
  "n2o",
  "totalCO2e",
  "notationKey",
  "activityType",
  "activityAmount",
  "activityUnit",
  "methodology",
  "activityDataSource",
  "activityDataQuality",
  "emissionFactorSource",
  "emissionFactorDescription",
  "emissionFactorUnit",
  "emissionFactorCO2",
  "emissionFactorCH4",
  "emissionFactorN2O",
  "emissionFactorTotalCO2e",
] as const;

export type InterpretationTargetField =
  (typeof INTERPRETATION_TARGET_FIELDS)[number];

/** LLM returns mapping from target field id to 0-based column index. */
export interface ColumnMappingResponse {
  mapping: Partial<Record<InterpretationTargetField, number>>;
}

/**
 * Returns true when the detected column mapping has the minimum required for eCRF processing:
 * (gpcRefNo or both sector+subsector), scope, and at least one gas column (co2, ch4, n2o, totalCO2e).
 * When false, the interpret route should use AI reshape instead of ECRFImportService.
 */
export function detectedColumnsMatchECRFStructure(
  detectedColumns: Record<string, number>,
): boolean {
  if (!detectedColumns || typeof detectedColumns !== "object") return false;
  const hasGpcRefNo = detectedColumns.gpcRefNo !== undefined;
  const hasSector = detectedColumns.sector !== undefined;
  const hasSubsector = detectedColumns.subsector !== undefined;
  const hasScope = detectedColumns.scope !== undefined;
  const hasGas =
    detectedColumns.co2 !== undefined ||
    detectedColumns.ch4 !== undefined ||
    detectedColumns.n2o !== undefined ||
    detectedColumns.totalCO2e !== undefined;
  const hasIdentity = hasGpcRefNo || (hasSector && hasSubsector);
  return !!(hasIdentity && hasScope && hasGas);
}

const LOG_LIMIT = 2000;

/** GPC sectors we consider; only map columns relevant to these. */
const INVENTORY_SECTORS = "Energy, Transport, Waste, IPPU, AFOLU";

// Same prompt structure as InventoryExtractionService: <role>, <task>, <input>, <output>, <taxonomy>, <example_output>
function buildSystemPrompt(options?: {
  targetYear?: number;
  targetCity?: string;
}): string {
  const targetYear = options?.targetYear;
  const targetCity = options?.targetCity;

  const targetYearLine =
    targetYear != null
      ? `Only consider data from the inventory target year(s). Inventory target year: ${targetYear}. When a year column is present, map it (e.g. to "year") so that data can be filtered to this year.`
      : 'When a year column is present, map it (e.g. to "year") so that data can be filtered by year.';

  const targetCityLine =
    targetCity != null && targetCity.trim() !== ""
      ? `Some files contain data for multiple cities. Only consider data for the target city: "${targetCity.trim()}". When a city, location, or municipality column is present, map it so that data can be filtered to this city.`
      : "";

  return `<role>
You are an interpreter of tabular GHG inventory files. You map spreadsheet/CSV columns to standard inventory field ids. You output only valid JSON with no commentary.
</role>

<task>
Some documents contain data on different spreadsheets; the content may include one or more tables (each with a header row and optional sample rows). Map columns for the table that contains the main inventory data. Only consider columns relevant to these sectors: ${INVENTORY_SECTORS}. ${targetYearLine}${targetCityLine ? ` ${targetCityLine}` : ""}

Prefer mapping GPC ref no (gpcRefNo) when the file has such a column (values look like I.1.1, I.2.1, II.1.2, etc.). Otherwise ensure sector, subsector, and activityType are mapped so that GPC reference can be resolved from sector + subsector + activity type (same as standard eCRF resolution). Sector and subsector columns in the file should align with the GPC taxonomy below (canonical names or common variants). Also map totalCO2e or gas columns (co2, ch4, n2o) when present. Assign each column a 0-based index and decide which standard field id best matches; leave unmapped if uncertain.
</task>

<input>
- documentContent (string): One or more tables. Each table may be preceded by a "Sheet: name" line. First row of each table = header row; columns are 0-based in order. Format may be CSV or multiple CSV blocks. Map the primary or most relevant table that contains inventory data for sectors ${INVENTORY_SECTORS}${targetYear != null ? ` and target year ${targetYear}` : ""}${targetCity != null && targetCity.trim() !== "" ? ` and target city "${targetCity.trim()}"` : ""}.
</input>

<output>
Return a single JSON object with one key "mapping" whose value is an object. No other keys, no markdown, no commentary. The "mapping" object may contain the following keys; each value is the 0-based column index (integer) for that column in the chosen table. Omit any key that has no matching column.

- gpcRefNo (integer): column index for GPC reference number (e.g. I.1.1, II.2.1).
- sector (integer): column index for sector name; must align with taxonomy below (canonical or variant).
- subsector (integer): column index for subsector name; must align with taxonomy below.
- scope (integer): column index for scope (e.g. "1", "2", "3").
- year (integer): column index for inventory/reporting year.
- co2, ch4, n2o (integer): column indices for gas breakdown (metric tonnes CO2e).
- totalCO2e (integer): column index for total emissions (metric tonnes CO2e).
- notationKey (integer): column index for notation/key (e.g. NE, NO, IE).
- activityType (integer): column index for activity/fuel type (e.g. "Diesel", "Natural gas").
- activityAmount (integer): column index for activity data amount.
- activityUnit (integer): column index for activity unit (e.g. liters, kWh, GJ).
- methodology (integer): column index for methodology.
- activityDataSource, activityDataQuality (integer): column indices for data source/quality.
- emissionFactorSource, emissionFactorDescription, emissionFactorUnit (integer): column indices for emission factor metadata.
- emissionFactorCO2, emissionFactorCH4, emissionFactorN2O, emissionFactorTotalCO2e (integer): column indices for emission factor values.

Use exact field id strings as keys. All values are JSON numbers (0-based column indices). Format: {"mapping": { "sector": 0, "subsector": 1, ... }}.
</output>

<taxonomy>
GPC sector → subsector hierarchy (sector and subsector columns in the file should match these canonical names or the mapping variants below):
${HIERARCHY_TEXT}

Mapping (report term → use this canonical): Sector: ${SECTOR_DICTIONARY_TEXT || "(none)"}. Subsector: ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}.
When mapping columns, prefer headers that correspond to this taxonomy (e.g. "Sector", "Sub-sector", "CRF - Sector", "Activity type", "GPC ref no", "tCO2e", "Year").
</taxonomy>

<example_output>
{"mapping": {"gpcRefNo": 0, "sector": 1, "subsector": 2, "scope": 3, "year": 4, "totalCO2e": 5, "co2": 6, "ch4": 7, "n2o": 8, "activityType": 9, "activityAmount": 10, "activityUnit": 11}}
</example_output>`;
}

const USER_PREFIX = `Table content (first row = headers, columns 0-based in order). Data may be from one or more spreadsheets:\n\n`;

export interface InterpretTabularOptions {
  /** Inventory target year; when set, prompt asks to only consider data for this year and to map year column. */
  targetYear?: number;
  /** Target city name; when set, prompt asks to only consider data for this city (some files contain multiple cities). */
  targetCity?: string;
}

/**
 * Interpret tabular content and return suggested column mapping (field id → column index).
 * Uses same LLM pattern as Path C extraction: system + user message, jsonMode, temperature 0.
 * Only considers sectors Energy, Transport, Waste, IPPU, AFOLU; prefers gpcRefNo when available, else sector + subsector + activityType.
 *
 * @param documentContent - Serialized table(s): header row + optional sample rows; may include multiple sheets
 * @param options - Optional targetYear (inventory year) so only data from that year is considered
 * @returns detectedColumns-style record (field id → 0-based index) for columns the LLM mapped
 */
export async function interpretTabular(
  documentContent: string,
  options?: InterpretTabularOptions,
): Promise<Record<string, number>> {
  const systemPrompt = buildSystemPrompt({
    targetYear: options?.targetYear,
    targetCity: options?.targetCity,
  });
  const userContent = USER_PREFIX + documentContent;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 0,
    maxTokens: 4096,
  });

  const truncated =
    responseContent.length > LOG_LIMIT
      ? responseContent.slice(0, LOG_LIMIT) +
        `...[truncated, total ${responseContent.length} chars]`
      : responseContent;
  logger.debug(
    { responseLength: responseContent.length },
    "Interpretation LLM output",
  );
  logger.debug(
    { interpretationResponse: truncated },
    "Interpretation LLM output",
  );

  const parsed = parseInterpretationResponse(responseContent);
  const mapping = parsed?.mapping;
  if (!mapping || typeof mapping !== "object") {
    logger.warn(
      { parsed },
      "Interpretation response missing or invalid mapping",
    );
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (
      INTERPRETATION_TARGET_FIELDS.includes(key as InterpretationTargetField) &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0
    ) {
      result[key] = value;
    }
  }
  return result;
}

function parseInterpretationResponse(
  content: string,
): ColumnMappingResponse | null {
  const trimmed = content.trim();
  let jsonStr = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const firstBracket = jsonStr.search(/\{/);
  if (firstBracket > 0) jsonStr = jsonStr.slice(firstBracket);
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(jsonStr) as ColumnMappingResponse;
  } catch {
    logger.warn(
      { raw: trimmed.slice(0, 500) },
      "Failed to parse interpretation JSON",
    );
    return null;
  }
}

/** Heuristic: headers look like composite field names with _scope_1, _scope_2, _scope_3 (e.g. residential_buildings_scope_1). */
const KEY_VALUE_SCOPE_PATTERN = /_scope_[123]\b|scope_[123]\b/i;
const MIN_KEY_VALUE_HEADERS = 5;
const MIN_KEY_VALUE_SCOPE_MATCHES = 2;

/**
 * Returns true when the table appears to be key-value format: column headers represent
 * (GPC category + scope) and each cell is the value (e.g. totalCO2e). Used to choose
 * LLM shaping instead of column-index mapping.
 */
export function isKeyValueFormat(headers: string[]): boolean {
  if (!headers || headers.length < MIN_KEY_VALUE_HEADERS) return false;
  const withScope = headers.filter(
    (h) => typeof h === "string" && KEY_VALUE_SCOPE_PATTERN.test(h),
  );
  return withScope.length >= MIN_KEY_VALUE_SCOPE_MATCHES;
}

function buildKeyValueShapePrompt(options?: {
  targetYear?: number;
  targetCity?: string;
}): string {
  const targetYear = options?.targetYear;
  const targetCity = options?.targetCity;
  const yearLine =
    targetYear != null
      ? `Use year ${targetYear} for all rows (inventory target year).`
      : "Infer year from the table (e.g. a 'year' column or row) when present; otherwise use null.";
  const cityLine =
    targetCity != null && targetCity.trim() !== ""
      ? ` Only include data for the target city: "${targetCity.trim()}".`
      : "";

  return `<role>
You are an interpreter of key-value GHG inventory tables. Column headers are composite: they encode both the GPC category (sector/subsector) and the scope or gas type. The cell value is the emission (totalCO2e) or activity value. You output only valid JSON with no commentary.
</role>

<task>
The table is in key-value format: each column header is a field name like "residential_buildings_scope_1" or "commercial_and_institutional_buildings_and_facilities_scope_2". The part before "_scope_1", "_scope_2", "_scope_3" (or "scope_1", "scope_2", "scope_3") is the category identifier—map it to GPC sector and subsector using the taxonomy below. The suffix indicates scope (1, 2, or 3) for that column. The value in the cell is totalCO2e (metric tonnes CO2e) for that category and scope.${cityLine}

Output one row per column that has a numeric emission value. Use the GPC sector and subsector canonical names from the taxonomy. Do not map the suffix to "Subsector" or "Scope" as a column—the header as a whole represents one (subsector, scope) pair; the value is totalCO2e. ${yearLine}
</task>

<input>
- documentContent: Table with first row = column headers (composite names), following rows = values. Headers may use underscores (e.g. residential_buildings_scope_1). Map the category part to GPC sector/subsector; the scope suffix to scope "1", "2", or "3"; the cell value to totalCO2e.
</input>

<output>
Return a single JSON object with one key "rows" whose value is an array of row objects. No other keys, no markdown. Each row: year (integer | null), sector (string, canonical from taxonomy), subsector (string, canonical from taxonomy), scope (string "1", "2", or "3"), totalCO2e (number). Include category (string | null) if useful (e.g. "Subsector total"). Use null for missing. Format: {"rows": [ {...}, ... ]}.
</output>

<taxonomy>
GPC sector → subsector hierarchy (map category identifiers to these canonical names):
${HIERARCHY_TEXT}

Mapping (report term → use this canonical): Sector: ${SECTOR_DICTIONARY_TEXT || "(none)"}. Subsector: ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}.
Common patterns: "residential_buildings" → Stationary Energy / Residential Buildings; "commercial_and_institutional_buildings" → Stationary Energy / Commercial And Institutional Buildings And Facilities; "on_road_transportation" → Transportation / On Road Transportation; "solid_waste" or "solid_waste_generated" → Waste / Solid Waste Generated In The City.
</taxonomy>

<example_output>
{"rows": [
  {"year": 2017, "sector": "Stationary Energy", "subsector": "Residential Buildings", "scope": "1", "totalCO2e": 35733, "category": "Subsector total"},
  {"year": 2017, "sector": "Stationary Energy", "subsector": "Residential Buildings", "scope": "2", "totalCO2e": 262254, "category": "Subsector total"},
  {"year": 2017, "sector": "Stationary Energy", "subsector": "Commercial And Institutional Buildings And Facilities", "scope": "1", "totalCO2e": 14748, "category": "Subsector total"}
]}
</example_output>`;
}

function parseKeyValueShapeResponse(content: string): ExtractedRow[] {
  const trimmed = content.trim();
  let jsonStr = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const firstBracket = jsonStr.search(/\{/);
  const firstArray = jsonStr.search(/\[/);
  if (firstBracket >= 0 && (firstArray < 0 || firstBracket < firstArray)) {
    jsonStr = jsonStr.slice(firstBracket);
  } else if (firstArray >= 0) {
    jsonStr = jsonStr.slice(firstArray);
  }
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(jsonStr) as { rows?: unknown[] } | unknown[];
    const raw: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { rows?: unknown[] })?.rows)
        ? (parsed as { rows: unknown[] }).rows
        : [];
    const rows = raw.map((row) =>
      normalizeKeyValueRow(row as Record<string, unknown>),
    );
    if (rows.length === 0 && raw.length > 0) {
      logger.debug(
        {
          sampleRaw: raw[0],
          parsedKeys:
            typeof raw[0] === "object" && raw[0] !== null
              ? Object.keys(raw[0] as object)
              : [],
        },
        "Shape response had rows but normalizer dropped all; check key names",
      );
    }
    return rows;
  } catch (e) {
    logger.warn(
      { err: e, raw: trimmed.slice(0, 500) },
      "Failed to parse key-value shape JSON",
    );
    return [];
  }
}

function normalizeKeyValueRow(row: Record<string, unknown>): ExtractedRow {
  const out: ExtractedRow = {
    year: null,
    sector: null,
    subsector: null,
    category: null,
    totalCO2e: null,
  };
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(String(v).replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const y = row.year ?? row.reporting_year ?? row.Year;
  if (typeof y === "number" && Number.isFinite(y)) out.year = y;
  else if (typeof y === "string" && /^\d{4}$/.test(y.trim()))
    out.year = parseInt(y, 10);

  const sec = row.sector ?? row.Sector;
  if (str(sec)) out.sector = str(sec);

  const sub = row.subsector ?? row.SubSector;
  if (str(sub)) out.subsector = str(sub);

  let scopeVal = row.scope ?? row.Scope;
  if (typeof scopeVal === "string") {
    const t = scopeVal.trim();
    if (/^[123]$/.test(t)) out.scope = t;
    else if (/scope\s*1|scope1/i.test(t)) out.scope = "1";
    else if (/scope\s*2|scope2/i.test(t)) out.scope = "2";
    else if (/scope\s*3|scope3/i.test(t)) out.scope = "3";
  }

  const cat = row.category ?? row.Category;
  if (str(cat)) out.category = str(cat);

  const co2e =
    row.totalCO2e ??
    row.total_co2e ??
    row.emissions ??
    row.co2e ??
    row["Emissions (metric tonnes CO2e)"];
  const n = num(co2e);
  if (n !== null) out.totalCO2e = n;

  const gpc = row.gpcRefNo ?? row.gpc_ref_no ?? row.gpcRef ?? row.GPC;
  if (str(gpc)) out.gpcRefNo = str(gpc);

  return out;
}

function buildGenericShapeTablePrompt(options?: {
  targetYear?: number;
  targetCity?: string;
}): string {
  const targetYear = options?.targetYear;
  const targetCity = options?.targetCity;
  const yearLine =
    targetYear != null
      ? `Use year ${targetYear} when not specified in the table.`
      : "Infer year from columns like 'Reporting year', 'Year', 'Account year' when present.";
  const cityLine =
    targetCity != null && targetCity.trim() !== ""
      ? ` Only include data for the target city: "${targetCity.trim()}".`
      : "";

  return `<role>
You are an interpreter of GHG inventory tables that do not follow the standard eCRF column layout. You reshape the table into GPC inventory rows. You output only valid JSON with no commentary.
</role>

<task>
The table may be in one of these forms:
(1) Single-row key-value: one row of data; each column header is a field name and the cell is the value. Examples: "Sector and scope (GPC reference number)" with value "Stationary Energy: energy use - Scope 1 (I.X.1)" → extract sector=Stationary Energy, subsector from "energy use", scope=1, gpcRefNo=I.X.1. "Emissions (metric tonnes CO2e)" or "Total CO2e" → totalCO2e. "Reporting year" or "Year" → year. Output one row combining these fields.
(2) Composite headers: column names like "residential_buildings_scope_1"; the part before _scope_1/_scope_2/_scope_3 is the category (map to GPC sector/subsector), the suffix is scope, the cell value is totalCO2e. Output one row per such column.
Use the GPC taxonomy below for sector/subsector canonical names. Do not map descriptive columns (e.g. "Sector and scope (GPC reference number)") to "Total CO2e"—that column holds sector/scope info; the emissions value is in a separate column like "Emissions (metric tonnes CO2e)". ${cityLine} ${yearLine}
</task>

<input>
- documentContent: Table with header row and one or more data rows. Interpret column headers and values to build inventory rows.
</input>

<output>
Return a single JSON object with one key "rows" whose value is an array of row objects. No other keys, no markdown. You must output at least one row when the table contains any emissions value or sector/scope description. Each row must use these exact keys: year (integer | null), sector (string | null), subsector (string | null), scope (string "1", "2", or "3" only), totalCO2e (number | null), gpcRefNo (string | null). Use null for missing. Format: {"rows": [ {"year": 2017, "sector": "...", "subsector": "...", "scope": "1", "totalCO2e": 38871, "gpcRefNo": null}, ... ]}.
</output>

<taxonomy>
GPC sector → subsector hierarchy:
${HIERARCHY_TEXT}

Mapping (report term → canonical): Sector: ${SECTOR_DICTIONARY_TEXT || "(none)"}. Subsector: ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}.
</taxonomy>

<example_output>
{"rows": [
  {"year": 2017, "sector": "Stationary Energy", "subsector": "Energy Use", "scope": "1", "totalCO2e": 38871, "gpcRefNo": "I.1", "category": null}
]}
</example_output>`;
}

/**
 * Reshape a table that could not be mapped to eCRF columns into GPC rows. Handles
 * single-row key-value (field-name columns + one data row) and composite headers (X_scope_1).
 */
export async function shapeTableToRows(
  documentContent: string,
  options?: InterpretTabularOptions,
): Promise<ExtractedRow[]> {
  const systemPrompt = buildGenericShapeTablePrompt({
    targetYear: options?.targetYear,
    targetCity: options?.targetCity,
  });
  const userContent = `Table to reshape into GPC inventory rows (headers + values):\n\n${documentContent}`;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 0,
    maxTokens: 8192,
  });

  logger.debug(
    { shapeTableLength: responseContent.length },
    "Generic shape table LLM output",
  );

  const rows = parseKeyValueShapeResponse(responseContent);
  if (rows.length === 0) {
    logger.warn(
      {
        responsePreview:
          responseContent.length > 600
            ? responseContent.slice(0, 600) + "..."
            : responseContent,
      },
      "Shape table produced no rows; check LLM output format",
    );
  }
  return rows;
}

/**
 * Shape a key-value tabular document into GPC rows using the LLM. Column headers
 * are composite (e.g. residential_buildings_scope_1); the LLM maps the category part
 * to GPC sector/subsector and the scope suffix to scope, and outputs one row per column.
 */
export async function shapeKeyValueToRows(
  documentContent: string,
  options?: InterpretTabularOptions,
): Promise<ExtractedRow[]> {
  const systemPrompt = buildKeyValueShapePrompt({
    targetYear: options?.targetYear,
    targetCity: options?.targetCity,
  });
  const userContent = `Key-value table (first row = headers, each column = one category+scope; cell value = totalCO2e):\n\n${documentContent}`;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 0,
    maxTokens: 8192,
  });

  const truncated =
    responseContent.length > LOG_LIMIT
      ? responseContent.slice(0, LOG_LIMIT) + `...[truncated]`
      : responseContent;
  logger.debug(
    { keyValueShapeLength: responseContent.length },
    "Key-value shape LLM output",
  );

  const rows = parseKeyValueShapeResponse(responseContent);
  if (rows.length === 0) {
    logger.warn("Key-value shape produced no rows");
  }
  return rows;
}
