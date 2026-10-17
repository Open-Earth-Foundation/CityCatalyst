/**
 * Path C: Extract GHG inventory line items from document text using the LLM wrapper.
 * Output shape matches pdf-emissions-reports-analysis schema (year, sector, subsector, category, totalCO2e, etc.).
 * Prompts ask for canonical sector/subsector names and GPC reference numbers when present in the document.
 */

import { createLLMClient, LLMError, LLMErrorCode } from "@/backend/llm";
import { logger } from "@/services/logger";
import { getLlmChunkConcurrency, mapPool } from "@/backend/asyncPool";
import { resolveGpcRefNo } from "@/util/GHGI/gpc-ref-resolver";
import { GRID_GENERATION_GPC_REF } from "@/util/GHGI/reported-totals";
import { toCanonical } from "@/util/notation-keys";
import {
  RECONCILIATION_TOLERANCE,
  isGrandTotal,
  type DroppedRowReason,
  type ExtractionSummary,
  type ReportedTotal,
} from "@/util/GHGI/extraction-summary";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import gpcNameMappings from "@/util/GHGI/data/gpc-name-mappings.json";

type GpcRow = { sector: string; subsector: string };
const gpcTable = gpcReferenceTable as GpcRow[];

/** GPC reference → scope in the taxonomy (null for I.4.4, which has no scope). */
const gpcRefScopes = new Map(
  (gpcReferenceTable as { gpcRefNo: string; scope?: number | null }[]).map(
    (row) => [row.gpcRefNo, row.scope ?? null],
  ),
);

/**
 * A reference copied from the document is kept only when the GPC taxonomy has it.
 * "I.1" with scope 2 becomes I.1.2. Combined or placeholder references
 * ("III.1.1/2", "III.X.1") are dropped; the sector, sub-sector and scope resolve them.
 * A reference whose taxonomy scope differs from the row's scope column is dropped
 * too: the column is the more reliable of the two (a copied reference from the
 * row above is a common model slip). The taxonomy scope is used, not the last
 * digit, because waste references (III.1.2 is scope 3) do not follow it.
 */
export function canonicalGpcRefNo(
  ref: string | null | undefined,
  scope?: string | null,
): string | null {
  const trimmed = ref?.trim();
  if (!trimmed) return null;
  if (gpcRefScopes.has(trimmed)) {
    const refScope = gpcRefScopes.get(trimmed);
    if (scope && refScope != null && String(refScope) !== scope) return null;
    return trimmed;
  }
  if (scope && gpcRefScopes.has(`${trimmed}.${scope}`)) {
    return `${trimmed}.${scope}`;
  }
  return null;
}

/**
 * Labels that mean a sum, whatever rowType the model gave. "Subsector total" is not
 * here: the prompt uses it for a sub-sector that has no activity breakdown.
 * An unqualified "Total" or "Grand total" without a scope is a grand total; a scoped
 * "Total" is the total of one scope column, so a subtotal. A sector's "Total" is
 * demoted later, when it equals that sector's line items (finalizeExtractedRows).
 * The others are subtotals.
 */
const GRAND_TOTAL_LABEL = /^\(?\s*(grand\s+)?total\s*\)?$/i;
const SUBTOTAL_LABEL =
  /^\(?\s*(all\s+[ivx]+\s+emissions|sub-?\s?total)\s*\)?$/i;

function sumLabelLevel(row: ExtractedRow): "subtotal" | "total" | null {
  const labels = [row.category, row.activityType]
    .map((label) => label?.trim())
    .filter((label): label is string => !!label);
  if (labels.some((label) => GRAND_TOTAL_LABEL.test(label))) {
    return row.scope ? "subtotal" : "total";
  }
  if (labels.some((label) => SUBTOTAL_LABEL.test(label))) return "subtotal";
  return null;
}

type NameMappings = {
  sector: Record<string, string>;
  subsector: Record<string, string>;
};
const nameMappings = gpcNameMappings as NameMappings;

/** Max chars of extraction LLM response to include in logs (avoids huge payloads). */
const EXTRACTION_LOG_LIMIT = 4000;

/**
 * Turn a slug (e.g. "on-road-transportation") into display form for the prompt ("On Road Transportation").
 * All hyphens are replaced with spaces and each word is capitalized, so subsector names with hyphens (e.g. "waste-water-treatment") work correctly.
 */
function slugToDisplay(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** GPC hierarchy: sector (display) → list of subsector (display) that belong to that sector. */
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

/** Variant → canonical sector name (display). Use when the report uses a different term for a sector. */
const SECTOR_VARIANT_TO_CANONICAL = (() => {
  const out: Record<string, string> = {};
  for (const [variant, slug] of Object.entries(nameMappings.sector)) {
    const canonical = slugToDisplay(slug);
    if (variant.trim() && canonical) out[variant] = canonical;
  }
  return out;
})();

/** Variant → canonical subsector name (display). Use when the report uses a different term for a subsector. */
const SUBSECTOR_VARIANT_TO_CANONICAL = (() => {
  const out: Record<string, string> = {};
  for (const [variant, slug] of Object.entries(nameMappings.subsector)) {
    const canonical = slugToDisplay(slug);
    if (variant.trim() && canonical) out[variant] = canonical;
  }
  return out;
})();

/** Format hierarchy for the prompt: one block per sector with its subsectors. */
const HIERARCHY_TEXT = [...SECTOR_SUBSECTOR_HIERARCHY.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([sector, subs]) => `- ${sector}: ${subs.join(", ")}`)
  .join("\n");

/** Format sector dictionary for the prompt: "report term" → use this sector. */
const SECTOR_DICTIONARY_TEXT = Object.entries(SECTOR_VARIANT_TO_CANONICAL)
  .filter(([variant]) => variant !== SECTOR_VARIANT_TO_CANONICAL[variant]) // skip identity
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([term, canonical]) => `"${term}" → ${canonical}`)
  .join("; ");

/** Format subsector dictionary for the prompt: "report term" → use this subsector. */
const SUBSECTOR_DICTIONARY_TEXT = Object.entries(SUBSECTOR_VARIANT_TO_CANONICAL)
  .filter(([variant]) => variant !== SUBSECTOR_VARIANT_TO_CANONICAL[variant])
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([term, canonical]) => `"${term}" → ${canonical}`)
  .join("; ");

export type ExtractedRowType = "line_item" | "subtotal" | "total";

export type ExtractedRow = {
  year: number | null;
  sector: string | null;
  subsector: string | null;
  /** GPC scope when present in the document (e.g. "1", "2", "3" for Scope 1/2/3). Fetched from uploaded file when available. */
  scope?: string | null;
  category: string | null;
  totalCO2e: number | null;
  co2?: number | null;
  ch4?: number | null;
  n2o?: number | null;
  gpcRefNo?: string | null;
  source?: string | null;
  /** Methodology name when present (e.g. Fuel Sales, Direct Measure, Geographic). Used to create ActivityValue. */
  methodology?: string | null;
  /** Activity amount when present (e.g. fuel consumed, distance). */
  activityAmount?: number | null;
  /** Unit for activity amount (e.g. tonnes, litres, km, GJ). */
  activityUnit?: string | null;
  /** Activity/fuel/vehicle type when present (e.g. Diesel, Natural gas). */
  activityType?: string | null;
  /** Data source description when present. */
  activityDataSource?: string | null;
  /** Data quality when present (e.g. high, medium, low). */
  activityDataQuality?: string | null;
  /** Notation key when the row has no measured emissions (NE, NO, IE, C). */
  notationKey?: string | null;
  /**
   * What the row is in the source table. Only `line_item` rows are imported.
   * Subtotals and totals are kept apart to reconcile the imported sum.
   * Missing on rows stored before this field existed (treated as `line_item`).
   */
  rowType?: ExtractedRowType | null;
  /** Unit of totalCO2e as written in the source (t, kt, Mt, tCO2e). Converted to tonnes after extraction. */
  unit?: string | null;
  emissionFactorUnit?: string | null;
  emissionFactorSource?: string | null;
  emissionFactorDescription?: string | null;
  emissionFactorCO2?: number | null;
  emissionFactorCH4?: number | null;
  emissionFactorN2O?: number | null;
  emissionFactorTotalCO2e?: number | null;
};

// Structured prompt per prompt-schema-authoring: <role>, <task>, <input>, <output>, <example_output>
const SYSTEM_PROMPT = `<role>
You are an extractor of GHG inventory line items from city emissions reports. You output only valid JSON with no commentary.
</role>

<task>
Extract emissions at the most granular level the document provides. Use only sector and subsector names from the hierarchy below; map report terms using the dictionary when given. Output totalCO2e in metric tonnes CO2e: when the column header, row label or table title states the unit, convert (e.g. 48 in a "kt CO2e" or "thousand tonnes" column → 48000) and set "unit" to "t". When you keep a number unconverted, set "unit" to the unit of that number as you output it (e.g. "kt"). Never mark a number as kt or Mt unless the document says so. Extract scope as "1", "2", or "3" when the document indicates it. Process the full document; do not return an error object or refuse for length. Output a separate row for every line item (every activity or subsector)—never a single aggregated row when the document has multiple. Also output subtotal and total rows, but mark them with rowType so they are not counted as data.

Row types (critical): set "rowType" on every row.
- "line_item": a measured value for one activity, subsector or GPC reference. Only these rows are imported.
- "subtotal": a sum of several line items (sector subtotal, "SUB-TOTAL", "(All II emissions)", a subsector total when the table also lists its activities).
- "total": a grand total of the inventory (TOTAL row, BASIC, BASIC+, BASIC+ S3, "Total GHG emissions").
Never output a line_item whose value is a sum of other rows you also output.

Scope columns (critical): when a table has separate Scope 1, Scope 2 and Scope 3 columns, output one row per non-empty scope cell, with scope "1", "2" or "3" and that cell's value. The columns BASIC, BASIC+, BASIC+ S3, Total and Net are sums over scopes: never output them as line_item rows (use rowType "total" or "subtotal"). Never output a row total as a Scope 1 row. Copy the GPC reference number (e.g. I.1.1, II.4.1, I.4.4) from the document into gpcRefNo when the table has a reference column. When the reference is written once for all scopes (e.g. "I.1"), use the reference of that scope (I.1.1 for scope 1, I.1.2 for scope 2, I.1.3 for scope 3).

Notation keys: when a cell holds NO, NE, IE or C (or "NA") instead of a number, output a row with totalCO2e null and notationKey set to that code, with the scope of its column.

Duplicate tables: the same sector, subsector and scope often appears in a summary table and in a detailed table. Extract each value once, from the table with the most detail (the one with GPC reference numbers when it exists). Do not use tables that compare with a previous inventory, list changes between inventories, or give other years (e.g. "2016 inventory vs this inventory", "analysis of changes"): they are not data for the inventory year.

Tables to use: Prefer tables that present a full-coverage summary of emissions—i.e. a comprehensive inventory that covers multiple sectors and/or the full scope (e.g. citywide, all scopes, or a complete sector breakdown with multiple subsectors and activities). Typical titles: "Citywide GHG Emissions Summary", "Emissions by sector", "City-wide GHG emissions", "Full inventory", "Inventory summary", "Emissions by category" (when it covers all categories). When the report has no single full-coverage table and presents each sector in its own table (for example one table for agriculture, one for transport), use those per-sector tables: together they are the inventory. Take each sector once, from the table with the most detail; never take a second table that splits the same sector total another way (by animal, by fuel, by year). Do NOT use: executive summary tables with only a single total; methodology-only text; targets/projections without full inventory figures; narrative sections; per-capita or percentage-only tables; tables that split the total by greenhouse gas (CO2, CH4, N2O), by region or by population instead of by sector, sub-sector or activity; or tables of another year or a comparison with another inventory.

Tables with year columns (critical): Many full-coverage tables have columns grouped by year (e.g. "CY 2005", "CY 2014", "CY 2015"), each with sub-columns like Consumed, tCO₂e, Source MMBtu. In that case:
- The year in your output is the year from the column header (e.g. 2015 from "CY 2015"), not a cell value. Set year to that integer for every row you extract from that column.
- For each table row (each sector/subsector/activity or fuel type), output one row with: year = the column's year; totalCO2e = the tCO₂e (or CO2e) value from that year column for that row only; activityAmount = the Consumed value from that year column for that row; activityUnit = the row's unit (liters, KWh, GJ, kg, VMT from the "Units" column or row context).
- Wrong: one or few rows with year=2015 and totalCO2e set to a single large total (e.g. sum of all 2015 column). Right: many rows—one per table row—each with year=2015 and totalCO2e = the tCO₂e value in the 2015 column for that specific row (e.g. Residential Natural gas 2015 → 9297070, Residential Electricity 2015 → 4035680, etc.).
- Do not treat the year label ("2015") as the only data point. Do not collapse all values from the 2015 column into one total. Output one row per table row, each with year=2015 (or the relevant column year) and that row's tCO₂e and Consumed from the 2015 column.
- If a target year is requested (e.g. 2015), extract only from the column(s) for that year; ignore other year columns for this extraction.

Granularity (critical):
- If the report has activity-level data (breakdown by fuel type, building type, category, or similar within a subsector): extract one row per activity with totalCO2e for that activity. Do not collapse to a single sector or subsector total when activity breakdown exists.
- If the report has only subsector-level data (no activity breakdown): extract one row per subsector with totalCO2e for that subsector; set category to a label like "Subsector total" or the subsector name.
- If the report has only sector-level totals (no subsector or activity breakdown): then output one row per sector with that sector total.
- Never output only the whole-sector total when the table actually shows subsector or activity breakdown—always extract each subsector and each activity row with its own totalCO2e.
</task>

<input>
- documentText (string): Full report text, or a segment of a longer report. Prefer full-coverage emissions summaries (comprehensive inventory); when the report has none, use its per-sector tables once each. Tables may have year as columns (e.g. CY 2005, CY 2015 with sub-columns Consumed, tCO₂e)—then take the year from the column header and, for each table row, take totalCO2e and Consumed from that year column for that row only (many output rows, each with that row's value). Ignore single-total summaries, per-capita tables and narrative. When the input is a segment, apply the same granularity rules (one row per activity/subsector/sector—never collapse to one total).
</input>

<output>
Return a single JSON object with one key "rows" whose value is an array of row objects. No other keys, no markdown, no "error" key. The "rows" array must have one object per inventory line item—typical reports produce many rows (do not collapse to a single row). Each object in "rows" has:
- year (integer | null): year the value belongs to. When the table has columns by year (e.g. CY 2015), use the year from the column header (2015), not a cell value; every row extracted from that column gets that year. Use the year of the table or column even when it is not the requested year (the system drops other years). Null only when the document gives no year at all.
- sector (string): canonical sector from hierarchy below.
- subsector (string): canonical subsector from hierarchy below; must belong under sector.
- category (string): activity/category name when at activity level (e.g. "Natural gas", "Diesel"); or "Subsector total" / subsector name when only subsector-level data exists.
- totalCO2e (number | null): emissions for this row only, in tonnes CO2e when the document states the unit (see unit)—per activity when activity data exists, per subsector when only subsector data exists. Null for a notation key. Do not put the whole sector total on every row; each row gets the value for that activity, subsector or scope cell.
- unit (string | null): unit of the totalCO2e number you output: "t" after converting to tonnes, or the unit of an unconverted number ("kt", "Mt"); null when the document does not say.
- rowType (string): "line_item", "subtotal" or "total" (see Row types).
- notationKey (string | null): "NO", "NE", "IE" or "C" when the cell has that notation instead of a number; else null.
- scope (string | null): "1", "2", or "3" when present in document; else null.
- gpcRefNo (string | null): e.g. I.1.1, II.2.1 when present; else null.
- co2, ch4, n2o (number | null): gas breakdown when present.
- source, methodology (string | null): when present.
- activityAmount (number | null): consumption/quantity value when table has such column.
- activityUnit (string | null): e.g. liters, kWh, GJ from "Units" or header.
- activityType (string | null): fuel/activity name when present.
- activityDataSource, activityDataQuality (string | null): when present.

Numbers: Output all numeric fields (totalCO2e, co2, ch4, n2o, activityAmount) as JSON numbers. Strip thousand separators (commas or spaces in "48,000" or "48 000" → 48000). Use a decimal point for decimals (e.g. 1.5); if the source uses a comma as decimal separator (e.g. "1,5"), convert to 1.5. Do not output numbers as strings or with commas/spaces inside them.
Use JSON null for missing values. Never output "-", "N/A", or similar as strings. Format: {"rows": [ {...}, {...}, ... ]}.
</output>

<taxonomy>
Sector → Subsector hierarchy (use only these pairs):
${HIERARCHY_TEXT}

Mapping (report term → use this): Sector: ${SECTOR_DICTIONARY_TEXT || "(none)"}. Subsector: ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}.
</taxonomy>

<example_output>
{"rows": [
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Natural gas", "totalCO2e": 125000, "unit": "tCO2e", "rowType": "line_item", "notationKey": null, "scope": "1", "gpcRefNo": "I.1.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 5", "methodology": null, "activityAmount": 5500000, "activityUnit": "GJ", "activityType": "Natural gas", "activityDataSource": null, "activityDataQuality": null},
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Electricity", "totalCO2e": 42000, "unit": "tCO2e", "rowType": "line_item", "notationKey": null, "scope": "2", "gpcRefNo": "I.1.2", "co2": null, "ch4": null, "n2o": null, "source": "Table 5", "methodology": null, "activityAmount": 12000, "activityUnit": "MWh", "activityType": "Electricity", "activityDataSource": null, "activityDataQuality": null},
  {"year": 2020, "sector": "Transportation", "subsector": "On Road Transportation", "category": "Diesel", "totalCO2e": 89000, "unit": "tCO2e", "rowType": "line_item", "notationKey": null, "scope": "1", "gpcRefNo": "II.1.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 7", "methodology": null, "activityAmount": 25000, "activityUnit": "liters", "activityType": "Diesel", "activityDataSource": null, "activityDataQuality": null},
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Subtotal", "totalCO2e": 167000, "unit": "tCO2e", "rowType": "subtotal", "notationKey": null, "scope": null, "gpcRefNo": null, "source": "Table 5"},
  {"year": 2020, "sector": "Waste", "subsector": "Solid Waste Disposal", "category": "Solid waste", "totalCO2e": null, "unit": null, "rowType": "line_item", "notationKey": "NO", "scope": "1", "gpcRefNo": "III.1.1", "source": "Table 5"}
]}
</example_output>`;

/** User message prefix when no target year. When target year is set, year instruction is injected before document. */
const USER_PROMPT_PREFIX = `Document text:\n\n`;

/** Prefix when sending a segment of a longer document (chunked extraction). Reinforces same granularity as full-document. */
const SEGMENT_PROMPT_PREFIX = `The following text is one segment of a longer emissions report. Prefer tables that present a full-coverage emissions summary (comprehensive inventory with multiple sectors/subsectors/activities)—e.g. "Citywide GHG Emissions Summary", "Emissions by sector", "Inventory summary". When the report has no such table and gives each sector in its own table, use those per-sector tables once each. Ignore executive summary totals, methodology-only text, and per-capita tables. Apply the same granularity rules as for a full document:
- If this segment contains activity-level data (e.g. breakdown by fuel type, building type, category): extract one row per activity with totalCO2e for that activity; do not collapse to a single subsector or sector total.
- If this segment contains only subsector-level data: extract one row per subsector with totalCO2e for that subsector; set category to "Subsector total" or the subsector name.
- If this segment contains only sector-level totals: output one row per sector.
- Never output a single aggregated row when the segment shows multiple line items (multiple activities, subsectors, or sectors). Extract every row you see in the inventory tables.
- If the table has columns by year (e.g. CY 2015): year = the column header (2015); totalCO2e = tCO₂e from that column for that row; activityAmount = Consumed from that column; one output row per table row, do not collapse the year column into one total.
- Set rowType on every row ("line_item", "subtotal" or "total"). Scope 1/2/3 columns give one line_item row each; BASIC, BASIC+, Total and sub-total columns or rows are never line_item. Convert to tonnes when the unit is stated and set "unit" to "t".
- Numbers: output numeric fields as JSON numbers; strip thousand separators (e.g. 48,000 → 48000); use decimal point for decimals (1,5 → 1.5).\n\nSegment text:\n\n`;

/** Max document length in a single LLM request; above CHUNK_THRESHOLD we split into chunks. */
const MAX_DOCUMENT_CHARS = 80_000;

/** When content exceeds this length, we extract in chunks to avoid timeouts and token limits. */
const CHUNK_THRESHOLD = 50_000;
const CHUNK_SIZE = 40_000;
const CHUNK_OVERLAP = 4_000;

/**
 * Document content is user-controlled; callers should enforce rate limiting and monitor
 * for suspicious extraction patterns. We reject content that clearly looks like
 * prompt-injection (instruction-like text at the start of the document).
 */
const PROMPT_INJECTION_LOOKUP_LENGTH = 400;
const PROMPT_INJECTION_PREFIXES = [
  "ignore previous instructions",
  "ignore all previous",
  "disregard all previous",
  "you are now",
  "new instructions:",
  "system:",
  "assistant:",
  "### instruction",
  "### system",
];

export type ExtractOptions = {
  /** When set, prompt and filter so only rows for this year are returned (inventory year). */
  targetYear?: number;
  /** Called after each chunk when extraction runs in chunks (current 1-based, total). Used for progress polling. */
  onChunkProgress?: (current: number, total: number) => void | Promise<void>;
};

export type ExtractionResult = {
  rows: ExtractedRow[];
  summary: ExtractionSummary;
};

const MAX_REPORTED_TOTALS = 200;

/** A page needs at least this many numbers of 3+ digits to be sent to the model. */
const MIN_NUMBERS_PER_PAGE = 8;
/** Above this many candidate pages, per-page extraction costs too much; use chunks. */
const MAX_CANDIDATE_PAGES = 150;
/**
 * A page run may be this far from a grand total and still be chosen. Wider than
 * the review warning (1%): the model can miss a few rows of a dense table, and the
 * warning still tells the user.
 */
const PAGE_SELECTION_TOLERANCE = 0.1;
/** Totals below this share of the largest reported total are sector totals. */
const MIN_GRAND_TOTAL_SHARE = 0.5;
/**
 * Longest run of consecutive pages a single inventory table may span. A report that
 * gives one table per sector (agriculture, transport, stationary energy, waste, IPPU,
 * forestry) spreads one inventory over five or six pages.
 */
const MAX_PAGES_PER_TABLE = 6;
/** A run must span this many sectors to be matched against a total below the share. */
const MIN_SECTORS_FOR_MINOR_TOTAL = 3;

export type DocumentPage = { page: number; text: string };

/**
 * Split OCR output into pages: Mistral writes `<!-- page: N -->` before each page;
 * pdftotext separates pages with form feeds. Returns [] when there are no page breaks.
 */
export function splitDocumentPages(content: string): DocumentPage[] {
  const marker = /<!--\s*page:\s*(\d+)\s*-->/g;
  const matches = [...content.matchAll(marker)];
  if (matches.length >= 2) {
    return matches.map((match, i) => {
      const start = (match.index ?? 0) + match[0].length;
      const end =
        i + 1 < matches.length
          ? (matches[i + 1].index ?? content.length)
          : content.length;
      return { page: Number(match[1]), text: content.slice(start, end) };
    });
  }
  const formFeedPages = content.split("\f");
  if (formFeedPages.length >= 2) {
    return formFeedPages.map((text, i) => ({ page: i + 1, text }));
  }
  return [];
}

/** Pages with enough numbers to hold an emissions table. */
export function isCandidatePage(text: string): boolean {
  return (text.match(/\d[\d,]{2,}/g) ?? []).length >= MIN_NUMBERS_PER_PAGE;
}

type PageResult = { page: number; result: ExtractionResult };

const EMPTY_RESULT: ExtractionResult = {
  rows: [],
  summary: {
    reportedTotals: [],
    droppedRows: {},
    importedSum: 0,
    yearAssumed: false,
  },
};

/**
 * Distance of a page's line items from a grand total on the same page, for pages
 * holding GPC rows (scope and reference). Null when there is nothing to compare.
 */
function ownTotalDeviation({ rows, summary }: ExtractionResult): number | null {
  if (!rows.some((row) => row.scope && row.gpcRefNo)) return null;
  const totals = summary.reportedTotals.filter(
    (t) => isGrandTotal(t) && t.value !== 0,
  );
  if (totals.length === 0) return null;
  return Math.min(
    ...totals.map(
      (t) => Math.abs(summary.importedSum - t.value) / Math.abs(t.value),
    ),
  );
}

function mergeDropped(
  target: ExtractionSummary["droppedRows"],
  source: ExtractionSummary["droppedRows"],
): void {
  for (const [reason, count] of Object.entries(source) as [
    DroppedRowReason,
    number,
  ][]) {
    target[reason] = (target[reason] ?? 0) + count;
  }
}

/**
 * Choose the rows of one inventory table out of per-page extractions.
 * Candidates are runs of 1 to MAX_PAGES_PER_TABLE consecutive pages whose line items
 * add up to a grand total of the document within PAGE_SELECTION_TOLERANCE; a page
 * joins a run only when it brings the sum closer to that total.
 * Ranking: runs with GPC rows (scope and reference) that reconcile within 1% first,
 * then other runs with GPC rows, then runs without them. Inside the 1% band the run
 * with more GPC rows wins, then the closer sum; outside it, the closer sum wins.
 * Year: pages are finalized with the year assumption deferred. When any line item
 * names a year, year-less rows are dropped here; when none does, the target year is
 * assumed and a run must reconcile within 1%. Without a target year no year logic runs.
 * Totals with a scope are never grand totals; sector totals were demoted per page.
 * A page that adds only notation-key rows with scope and reference (NO, IE, NE, C)
 * leaves the sum unchanged; it still joins the run as a continuation of the table.
 * Without a candidate every page's rows are kept (fallback).
 * Exported for unit tests.
 */
export function selectReconciledPages(
  input: PageResult[],
  targetYear?: number,
): ExtractionResult {
  const droppedRows: ExtractionSummary["droppedRows"] = {};
  for (const p of input)
    mergeDropped(droppedRows, p.result.summary.droppedRows);

  // Line items only, as in the chunk path: a year on a total alone says nothing
  // about the year of year-less line items.
  const documentNamesYear =
    targetYear != null &&
    input.some(
      (p) =>
        p.result.rows.some((row) => row.year != null) ||
        (p.result.summary.droppedRows.other_year ?? 0) > 0 ||
        (p.result.summary.droppedRows.missing_year ?? 0) > 0,
    );
  const yearAssumed =
    targetYear != null &&
    !documentNamesYear &&
    input.some((p) => p.result.rows.length > 0);
  const sorted = [...input]
    .sort((a, b) => a.page - b.page)
    .map((p): PageResult => {
      const yearless = p.result.rows.filter((row) => row.year == null);
      if (yearless.length === 0 || targetYear == null) return p;
      const rows = documentNamesYear
        ? p.result.rows.filter((row) => row.year != null)
        : p.result.rows.map((row) =>
            row.year == null ? { ...row, year: targetYear ?? null } : row,
          );
      if (documentNamesYear) {
        droppedRows.missing_year =
          (droppedRows.missing_year ?? 0) + yearless.length;
      }
      return {
        page: p.page,
        result: {
          rows,
          summary: { ...p.result.summary, importedSum: sumImported(rows) },
        },
      };
    });
  const reportedTotals = sorted.flatMap((p) => p.result.summary.reportedTotals);
  // Without any year in the document a wrong table cannot be told apart by year:
  // accept only a run that reconciles within the review tolerance.
  const selectionTolerance = yearAssumed
    ? RECONCILIATION_TOLERANCE
    : PAGE_SELECTION_TOLERANCE;

  const yearTotals = reportedTotals
    .filter(
      (t) =>
        isGrandTotal(t) &&
        t.value !== 0 &&
        (t.year == null || targetYear == null || t.year === targetYear),
    )
    .map((t) => t.value);
  // A sector total the model marked "total" must not select a single sector.
  const largest = Math.max(0, ...yearTotals.map((v) => Math.abs(v)));
  const grandTotals = [
    ...new Set(
      yearTotals.filter((v) => Math.abs(v) >= largest * MIN_GRAND_TOTAL_SHARE),
    ),
  ];
  // Net totals (gross minus forestry removals) fall below the share. A run that spans
  // several sectors may match one; a single sector may not.
  const minorTotals = [
    ...new Set(yearTotals.filter((v) => !grandTotals.includes(v))),
  ];
  const allTotals = [...grandTotals, ...minorTotals];

  type Run = {
    start: number;
    end: number;
    rows: number;
    structured: number;
    deviation: number;
  };
  const tier = (run: Run): number =>
    (run.structured > 0 ? 0 : 2) +
    (run.deviation <= RECONCILIATION_TOLERANCE ? 0 : 1);
  const better = (a: Run, b: Run): boolean => {
    if (tier(a) !== tier(b)) return tier(a) < tier(b);
    const inBand = tier(a) % 2 === 0;
    if (inBand && a.structured !== b.structured) {
      return a.structured > b.structured;
    }
    // Two tables of one report that both reach a total: take the more detailed one
    // (sector tables over the same total split by greenhouse gas).
    if (
      inBand &&
      a.structured === 0 &&
      b.structured === 0 &&
      a.rows !== b.rows
    ) {
      return a.rows > b.rows;
    }
    if (a.deviation !== b.deviation) return a.deviation < b.deviation;
    return a.rows > b.rows;
  };

  let best: Run | null = null;
  for (let start = 0; start < sorted.length; start++) {
    let sum = 0;
    let rowCount = 0;
    let structured = 0;
    // Deviation from each reported total at the previous page of the run.
    const previous = allTotals.map(() => Infinity);
    const runSectors = new Set<string>();
    // A row repeated on the next page (a table row carried over) counts once.
    const runKeys = new Set<string>();
    for (
      let end = start;
      end < sorted.length && end - start < MAX_PAGES_PER_TABLE;
      end++
    ) {
      // A run must be consecutive pages of the document.
      if (end > start && sorted[end].page !== sorted[end - 1].page + 1) break;
      const { rows } = sorted[end].result;
      // Notation keys of the same GPC table carry no value but belong to the run.
      const notationOnly =
        rows.length > 0 &&
        rows.every(
          (r) => r.totalCO2e == null && r.notationKey && r.scope && r.gpcRefNo,
        );
      const fresh = rows.filter((r) => !runKeys.has(repeatKey(r)));
      for (const r of fresh) {
        runKeys.add(repeatKey(r));
        const sector = r.sector?.trim().toLowerCase();
        if (sector) runSectors.add(sector);
      }
      sum += sumImported(fresh);
      rowCount += fresh.length;
      structured += fresh.filter((r) => r.scope && r.gpcRefNo).length;
      if (rowCount === 0) continue;
      const deviations = allTotals.map(
        (total) => Math.abs(sum - total) / Math.abs(total),
      );
      const eligible = allTotals.map(
        (total) =>
          grandTotals.includes(total) ||
          runSectors.size >= MIN_SECTORS_FOR_MINOR_TOTAL,
      );
      const deviation = Math.min(
        ...deviations.filter((_, index) => eligible[index]),
      );
      // A page that moves the sum away from every total is not part of the table.
      // A page of notation keys leaves the sum where it is and stays.
      const improved = deviations.some(
        (d, index) => eligible[index] && d < previous[index],
      );
      const unchanged = deviations.every(
        (d, index) => !eligible[index] || d <= previous[index],
      );
      if (!improved && !(notationOnly && unchanged)) break;
      deviations.forEach((d, index) => {
        previous[index] = d;
      });
      if (deviation > selectionTolerance) continue;
      const run = { start, end, rows: rowCount, structured, deviation };
      if (!best || better(run, best)) best = run;
    }
  }

  const base = { reportedTotals, targetYear: targetYear ?? null };

  // All pages, deduped across pages. Rows are already in tonnes and already
  // filtered by year, so a second pass only removes repeats.
  const buildFallback = (): ExtractionResult => {
    const dropped = { ...droppedRows };
    const merged = finalizeExtractedRows(
      sorted.flatMap((p) => p.result.rows),
      targetYear,
    );
    mergeDropped(dropped, merged.summary.droppedRows);
    return {
      rows: merged.rows,
      summary: {
        ...base,
        droppedRows: dropped,
        importedSum: merged.summary.importedSum,
        yearAssumed,
        pageSelection: "fallback",
        selectedPages: sorted
          .filter((p) => p.result.rows.length > 0)
          .map((p) => p.page),
      },
    };
  };

  if (best && best.deviation > RECONCILIATION_TOLERANCE) {
    // A run that only roughly reaches a total can be a part of the inventory (the
    // per-sector tables of one report cover 99% of the gross total and leave out a
    // small sector and the forestry removals). Take every page instead when the
    // whole document reconciles with a reported total.
    const fallback = buildFallback();
    const wholeDeviation = Math.min(
      ...yearTotals.map(
        (total) =>
          Math.abs(fallback.summary.importedSum - total) / Math.abs(total),
      ),
    );
    logger.info(
      {
        runDeviation: best.deviation,
        runSum: sumImported(
          sorted.slice(best.start, best.end + 1).flatMap((p) => p.result.rows),
        ),
        wholeSum: fallback.summary.importedSum,
        wholeDeviation,
        totals: yearTotals,
      },
      "Rough page run compared with the whole document",
    );
    if (wholeDeviation <= RECONCILIATION_TOLERANCE) return fallback;
  }

  if (best) {
    const chosen = sorted.slice(best.start, best.end + 1);
    const otherRows = sorted
      .filter((p) => !chosen.includes(p))
      .reduce((n, p) => n + p.result.rows.length, 0);
    if (otherRows > 0) droppedRows.other_page = otherRows;
    const keys = new Set<string>();
    const rows: ExtractedRow[] = [];
    for (const row of chosen.flatMap((p) => p.result.rows)) {
      const key = repeatKey(row);
      if (keys.has(key)) {
        droppedRows.duplicate = (droppedRows.duplicate ?? 0) + 1;
        continue;
      }
      keys.add(key);
      rows.push(row);
    }
    return {
      rows,
      summary: {
        ...base,
        droppedRows,
        importedSum: sumImported(rows),
        yearAssumed: yearAssumed && rows.length > 0,
        pageSelection: "reconciled",
        selectedPages: chosen.map((p) => p.page),
      },
    };
  }

  return buildFallback();
}

/**
 * Extract inventory rows from document text using the configured LLM.
 * Returns the rows only; use extractInventoryFromDocument for the reconciliation summary.
 */
export async function extractInventoryRowsFromDocument(
  documentContent: string,
  options?: ExtractOptions,
): Promise<ExtractedRow[]> {
  return (await extractInventoryFromDocument(documentContent, options)).rows;
}

/**
 * Extract inventory rows from document text using the configured LLM.
 * Document content is user-controlled; prompt-injection risk is mitigated by rejecting
 * content that starts with instruction-like text. API layer should use rate limiting
 * and monitor for suspicious extraction patterns.
 *
 * @param documentContent - Raw text from PDF (or other source); must be end-user content
 * @param options - Optional targetYear to extract only that year (e.g. inventory year)
 * @returns Array of normalized row objects; throws on parse or LLM failure
 * @throws LLMError with BAD_REQUEST if content appears to be prompt-injection
 */
export async function extractInventoryFromDocument(
  documentContent: string,
  options?: ExtractOptions,
): Promise<ExtractionResult> {
  const trimmed = documentContent.trim();
  const lookup = trimmed.slice(0, PROMPT_INJECTION_LOOKUP_LENGTH).toLowerCase();
  const looksLikeInjection = PROMPT_INJECTION_PREFIXES.some(
    (prefix) => lookup.startsWith(prefix) || lookup.includes("\n" + prefix),
  );
  if (looksLikeInjection) {
    logger.warn(
      "Extraction rejected: document starts with instruction-like content (possible prompt injection)",
    );
    throw new LLMError(
      "Document content could not be processed",
      LLMErrorCode.BAD_REQUEST,
    );
  }

  const targetYear = options?.targetYear;
  const yearInstruction =
    targetYear != null
      ? `Extract only emissions data for the year ${targetYear}. Do not output rows from tables or columns of other years. Set year to the year each value belongs to (${targetYear}); use null only when the document gives no year.\n\n`
      : "";

  const year =
    targetYear != null && Number.isInteger(targetYear) ? targetYear : undefined;
  const pages = splitDocumentPages(documentContent).filter((p) =>
    isCandidatePage(p.text),
  );
  if (pages.length > 0 && pages.length <= MAX_CANDIDATE_PAGES) {
    logger.info(
      { pageCount: pages.length, totalChars: documentContent.length },
      "Extraction page by page with reconciliation",
    );
    const onProgress = options?.onChunkProgress;
    // One progress bar for the page phase and a possible chunk fallback, so the
    // bar never moves back. The chunk count is known before any call.
    const progressTotal = pages.length + countChunks(documentContent);
    const failedPages: { page: number; error: unknown }[] = [];
    const perPage = await mapPool(
      pages,
      getLlmChunkConcurrency(),
      async (page): Promise<PageResult> => {
        const extract = async () =>
          finalizeExtractedRows(
            normalizeExtractedRows(
              await extractSegment(page.text, yearInstruction, false),
            ),
            year,
            { deferYearAssumption: true },
          );
        let result: ExtractionResult;
        try {
          result = await extract().catch((error) => {
            logger.info(
              { page: page.page, err: error },
              "Page extraction failed; retrying once",
            );
            return extract();
          });
        } catch (error) {
          // One unreadable page must not fail the whole import.
          logger.warn(
            { page: page.page, err: error },
            "Page extraction failed twice; page skipped",
          );
          failedPages.push({ page: page.page, error });
          return { page: page.page, result: EMPTY_RESULT };
        }
        // The model sometimes skips a column of a dense table. When the page states
        // its own grand total and the rows miss it, ask once more; keep the closer.
        const first = ownTotalDeviation(result);
        if (first != null && first > RECONCILIATION_TOLERANCE) {
          const retry = await extract().catch(() => null);
          const second = retry ? ownTotalDeviation(retry) : null;
          if (retry && second != null && second < first) result = retry;
          logger.info(
            { page: page.page, first, second },
            "Page retried: rows did not add up to the page total",
          );
        }
        return { page: page.page, result };
      },
      async (completedCount) => {
        if (onProgress) {
          await Promise.resolve(onProgress(completedCount, progressTotal));
        }
      },
    );
    if (failedPages.length === pages.length) throw failedPages[0].error;
    const failed = failedPages.map((f) => f.page).sort((a, b) => a - b);
    const withFailed = (result: ExtractionResult): ExtractionResult =>
      failed.length > 0
        ? { ...result, summary: { ...result.summary, failedPages: failed } }
        : result;
    const selected = withFailed(selectReconciledPages(perPage, year));
    logger.info(
      {
        pageSelection: selected.summary.pageSelection,
        selectedPages: selected.summary.selectedPages,
        importedSum: selected.summary.importedSum,
        failedPages: failedPages.map((f) => f.page),
      },
      "Page selection finished",
    );
    if (selected.summary.pageSelection === "fallback") {
      // No page run reconciles. Per-page rows carry more noise than whole-document
      // chunks (CC-1008 live runs), so extract the old way.
      const chunked = await extractByChunks(
        documentContent,
        yearInstruction,
        options,
        { offset: pages.length, total: progressTotal },
      );
      const result = finalizeExtractedRows(
        normalizeExtractedRows(chunked),
        year,
      );
      return checkExtractionResult(
        withFailed({
          rows: result.rows,
          summary: { ...result.summary, pageSelection: "fallback" },
        }),
        chunked.length,
        targetYear,
      );
    }
    if (onProgress) {
      await Promise.resolve(onProgress(progressTotal, progressTotal));
    }
    const extractedCount = perPage.reduce(
      (n, p) =>
        n +
        p.result.rows.length +
        Object.values(p.result.summary.droppedRows).reduce(
          (a, b) => a + (b ?? 0),
          0,
        ),
      0,
    );
    return checkExtractionResult(selected, extractedCount, targetYear);
  }

  const allRows = await extractByChunks(
    documentContent,
    yearInstruction,
    options,
  );
  return checkExtractionResult(
    finalizeExtractedRows(normalizeExtractedRows(allRows), year),
    allRows.length,
    targetYear,
  );
}

/** Number of LLM calls extractByChunks makes for this document. */
function countChunks(documentContent: string): number {
  return documentContent.length <= CHUNK_THRESHOLD
    ? 1
    : splitIntoChunks(documentContent, CHUNK_SIZE, CHUNK_OVERLAP).length;
}

/**
 * Whole-document extraction: one call, or overlapping chunks for long text.
 * `progress` places these calls after earlier work on the same progress bar.
 */
async function extractByChunks(
  documentContent: string,
  yearInstruction: string,
  options?: ExtractOptions,
  progress?: { offset: number; total: number },
): Promise<ExtractedRow[]> {
  const onProgress = options?.onChunkProgress;
  let allRows: ExtractedRow[];

  if (documentContent.length <= CHUNK_THRESHOLD) {
    const content =
      documentContent.length > MAX_DOCUMENT_CHARS
        ? documentContent.slice(0, MAX_DOCUMENT_CHARS) +
          "\n\n[Document truncated for length.]"
        : documentContent;
    allRows = await extractSegment(content, yearInstruction, false);
    if (progress && onProgress) {
      await Promise.resolve(onProgress(progress.offset + 1, progress.total));
    }
  } else {
    const chunks = splitIntoChunks(documentContent, CHUNK_SIZE, CHUNK_OVERLAP);
    logger.info(
      { chunkCount: chunks.length, totalChars: documentContent.length },
      "Extraction using chunks to avoid timeout",
    );
    const segmentPrefix = yearInstruction + SEGMENT_PROMPT_PREFIX;
    const concurrency = getLlmChunkConcurrency();
    const perChunkRows = await mapPool(
      chunks,
      concurrency,
      async (chunk) => extractSegment(chunk, segmentPrefix, true),
      async (completedCount, total) => {
        if (onProgress) {
          await Promise.resolve(
            progress
              ? onProgress(progress.offset + completedCount, progress.total)
              : onProgress(completedCount, total),
          );
        }
      },
    );
    logger.info(
      { chunkCount: chunks.length, concurrency },
      "Extraction chunks merged (parallel pool)",
    );
    allRows = mergeAndDedupeRows(perChunkRows);
  }
  return allRows;
}

/** Log and reject empty results the same way for the page and chunk paths. */
function checkExtractionResult(
  { rows: result, summary }: ExtractionResult,
  extractedCount: number,
  targetYear: number | undefined,
): ExtractionResult {
  if (
    targetYear != null &&
    Number.isInteger(targetYear) &&
    extractedCount > 0 &&
    result.length === 0
  ) {
    logger.warn(
      {
        targetYear,
        rowsBeforeFilter: extractedCount,
        dropped: summary.droppedRows,
      },
      "All extracted rows dropped before import (no line item for the target year)",
    );
    if (
      (summary.droppedRows.other_year ?? 0) +
        (summary.droppedRows.missing_year ?? 0) >
      0
    ) {
      throw new LLMError(
        "Inventory not found for the target year",
        LLMErrorCode.BAD_REQUEST,
      );
    }
  }

  if (summary.yearAssumed) {
    logger.warn(
      { targetYear },
      "Extraction rows carry no year; assigned the target year",
    );
  }

  if (result.length === 0) {
    logger.warn(
      {
        totalRowsBeforeFilter: extractedCount,
        targetYear: targetYear ?? null,
      },
      "Extraction produced zero rows: LLM may have returned empty array or no parseable rows",
    );
  }

  return { rows: result, summary };
}

/**
 * Split content into overlapping chunks so no row is cut in the middle.
 * Exported for unit tests and measurement of multi-chunk Path C thresholds.
 *
 * @param content - Full document text
 * @param chunkSize - Max characters per chunk
 * @param overlap - Characters reused at the start of the next chunk
 */
export function splitIntoChunks(
  content: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end));
    if (end >= content.length) break;
    start = end - overlap;
  }
  return chunks;
}

/** Path C chunking thresholds used by extractInventoryRowsFromDocument. */
export const PATH_C_CHUNK_THRESHOLD = CHUNK_THRESHOLD;
export const PATH_C_CHUNK_SIZE = CHUNK_SIZE;
export const PATH_C_CHUNK_OVERLAP = CHUNK_OVERLAP;

/**
 * Dedupe rows from multiple chunks (overlap can produce duplicates). Use a simple key.
 * Exported for unit tests.
 */
export function mergeAndDedupeRows(
  perChunkRows: ExtractedRow[][],
): ExtractedRow[] {
  const seen = new Set<string>();
  const out: ExtractedRow[] = [];
  for (const rows of perChunkRows) {
    for (const row of rows) {
      const key = [
        row.year ?? "",
        row.sector ?? "",
        row.subsector ?? "",
        row.category ?? "",
        row.scope ?? "",
        row.gpcRefNo ?? "",
        row.rowType ?? "",
        row.notationKey ?? "",
        String(row.totalCO2e ?? ""),
      ].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/**
 * Run one LLM extraction on a single document or segment. Returns normalized rows only.
 */
async function extractSegment(
  content: string,
  prefix: string,
  isSegment: boolean,
): Promise<ExtractedRow[]> {
  const userContent = prefix + (isSegment ? "" : USER_PROMPT_PREFIX) + content;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    // Table extraction needs a stronger model than column mapping (CC-1008:
    // gpt-4o-mini dropped columns of the Auckland GPC table on 2 calls of 3).
    model: process.env.LLM_EXTRACTION_MODEL?.trim() || undefined,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 0, // Deterministic output for factual extraction; reduces hallucinations
    maxTokens: 16000,
  });

  const truncated =
    responseContent.length > EXTRACTION_LOG_LIMIT
      ? responseContent.slice(0, EXTRACTION_LOG_LIMIT) +
        `...[truncated, total ${responseContent.length} chars]`
      : responseContent;
  logger.debug(
    { isSegment, responseLength: responseContent.length },
    "Extraction LLM output",
  );
  logger.debug({ extractionResponse: truncated }, "Extraction LLM output");

  const parsed = parseExtractionResponse(responseContent);
  return normalizeRows(parsed);
}

/**
 * Extract the first JSON array from LLM response. Handles markdown code blocks,
 * leading/trailing text, and object wrappers like {"data": [...]}.
 */
function logExtractionFailure(raw: string, msg: string): void {
  const truncated =
    raw.length > EXTRACTION_LOG_LIMIT
      ? raw.slice(0, EXTRACTION_LOG_LIMIT) +
        `...[truncated, total ${raw.length} chars]`
      : raw;
  logger.error({ rawExtractionResponse: truncated }, msg);
}

/**
 * Find the index past the matching closing bracket, respecting brackets inside
 * double-quoted string literals and backslash escapes. Prevents values like
 * "Buildings [Commercial]" from breaking depth tracking.
 */
function findMatchingBracketEnd(
  str: string,
  startIndex: number,
  open: "[" | "{",
): number {
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let i = startIndex;
  while (i < str.length) {
    const c = str[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') {
        inString = false;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      i++;
      continue;
    }
    if (c === open) {
      depth++;
      i++;
      continue;
    }
    if (c === close) {
      depth--;
      if (depth === 0) return i + 1;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

function parseExtractionResponse(content: string): Record<string, unknown>[] {
  const trimmed = content.trim();

  // Strip markdown code block if present (```json ... ``` or ``` ... ```)
  let jsonStr = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // If there's still leading text, find the first '[' or '{'
  const firstBracket = jsonStr.search(/[\[{]/);
  if (firstBracket > 0) {
    jsonStr = jsonStr.slice(firstBracket);
  }

  // Extract the outermost bracket pair; ignore brackets inside string literals
  const open = jsonStr[0] as "[" | "{" | undefined;
  if (open === "[" || open === "{") {
    const end = findMatchingBracketEnd(jsonStr, 0, open);
    if (end > 0) jsonStr = jsonStr.slice(0, end);
  }

  // Strip trailing commas before ] or } (LLMs sometimes output these)
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Truncated response: try closing {"rows": [ ... with ]}
    const trimmedEnd = jsonStr.trimEnd();
    if (trimmedEnd.endsWith("}") && jsonStr.includes('"rows"')) {
      try {
        parsed = JSON.parse(trimmedEnd + "]}");
        logger.debug("Repaired truncated extraction JSON by appending ]}");
      } catch {
        /* ignore */
      }
    }
    if (parsed === undefined) {
      // Last resort: find a top-level JSON array
      const arrayStart = jsonStr.indexOf("[");
      if (arrayStart >= 0) {
        const end = findMatchingBracketEnd(jsonStr, arrayStart, "[");
        if (end > 0) {
          try {
            parsed = JSON.parse(jsonStr.slice(arrayStart, end));
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (parsed === undefined) {
      logExtractionFailure(content, "Extraction parse failed: not valid JSON");
      throw new LLMError(
        "Extraction response was not valid JSON",
        LLMErrorCode.BAD_REQUEST,
      );
    }
  }

  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && typeof obj.error === "string") {
      throw new LLMError(
        obj.error.trim() || "Model declined to extract",
        LLMErrorCode.BAD_REQUEST,
      );
    }
    const wrapperKeys = [
      "data",
      "rows",
      "items",
      "array",
      "result",
      "inventory",
      "entries",
      "line_items",
      "lineItems",
      "extracted",
      "emissions",
      "content",
      "output",
      "response",
      "answer",
      "records",
      "list",
      "inventory_rows",
      "inventoryRows",
    ];
    let candidate: unknown;
    for (const key of wrapperKeys) {
      if (obj[key] != null && Array.isArray(obj[key])) {
        candidate = obj[key];
        break;
      }
    }
    if (Array.isArray(candidate)) {
      arr = candidate;
    } else {
      const firstArray = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(firstArray)) {
        arr = firstArray;
      } else {
        const firstString = Object.values(obj).find(
          (v) => typeof v === "string" && v.trim().startsWith("["),
        );
        if (typeof firstString === "string") {
          try {
            const reparsed = JSON.parse(firstString.trim());
            if (Array.isArray(reparsed)) {
              arr = reparsed;
            } else {
              logExtractionFailure(
                content,
                "Extraction parse failed: string value did not parse to array",
              );
              throw new LLMError(
                `Extraction response was not a JSON array (top-level keys: ${Object.keys(obj).join(", ") || "(none)"})`,
                LLMErrorCode.BAD_REQUEST,
              );
            }
          } catch {
            logExtractionFailure(
              content,
              "Extraction parse failed: string value not a JSON array",
            );
            throw new LLMError(
              `Extraction response was not a JSON array (top-level keys: ${Object.keys(obj).join(", ") || "(none)"})`,
              LLMErrorCode.BAD_REQUEST,
            );
          }
        } else {
          // Model returned a single row object instead of an array (e.g. gpt-4o-mini)
          const rowLikeKeys = [
            "sector",
            "subsector",
            "category",
            "year",
            "totalCO2e",
            "activityType",
          ];
          const looksLikeRow = rowLikeKeys.some((k) => k in obj);
          if (looksLikeRow) {
            arr = [obj];
          } else {
            const keys = Object.keys(obj).join(", ");
            logExtractionFailure(
              content,
              `Extraction parse failed: no array in object (keys: ${keys || "(none)"})`,
            );
            throw new LLMError(
              `Extraction response was not a JSON array (top-level keys: ${keys || "(none)"})`,
              LLMErrorCode.BAD_REQUEST,
            );
          }
        }
      }
    }
  } else {
    const kind = parsed === null ? "null" : typeof parsed;
    logExtractionFailure(
      content,
      `Extraction parse failed: got ${kind}, expected array or object`,
    );
    throw new LLMError(
      `Extraction response was not a JSON array (got ${kind})`,
      LLMErrorCode.BAD_REQUEST,
    );
  }

  return arr.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
}

/** Strip commas and spaces used as thousands separators so "48,000" and "48 000" parse correctly. */
function normalizeNumberString(s: string): string {
  return String(s).replace(/,/g, "").replace(/\s+/g, "").trim();
}

/** Treat "-", "N/A", empty as missing (model sometimes outputs these instead of null). */
function isPlaceholderOrEmpty(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || t === "-" || t === "n/a" || t === "na" || t === "—";
}

/** Normalize scope from document (e.g. "Scope 1", "1", "Direct") to "1", "2", or "3"; return null if not recognized. */
function normalizeScopeString(s: string): "1" | "2" | "3" | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^1$|^scope\s*1$|^direct/.test(t)) return "1";
  if (/^2$|^scope\s*2$|^indirect/.test(t)) return "2";
  if (/^3$|^scope\s*3$/.test(t)) return "3";
  return null;
}

function normalizeRows(raw: Record<string, unknown>[]): ExtractedRow[] {
  return raw.map((row) => {
    const out: ExtractedRow = {
      year: null,
      sector: null,
      subsector: null,
      category: null,
      totalCO2e: null,
    };
    if (typeof row.year === "number" && Number.isFinite(row.year)) {
      out.year = row.year;
    } else if (typeof row.year === "string" && /^\d{4}$/.test(row.year)) {
      out.year = parseInt(row.year, 10);
    }
    if (typeof row.sector === "string") out.sector = row.sector;
    if (typeof row.subsector === "string") out.subsector = row.subsector;
    if (typeof row.scope === "string" && !isPlaceholderOrEmpty(row.scope)) {
      const normalized = normalizeScopeString(row.scope);
      if (normalized) out.scope = normalized;
    }
    if (typeof row.category === "string") out.category = row.category;
    if (typeof row.totalCO2e === "number" && Number.isFinite(row.totalCO2e)) {
      out.totalCO2e = row.totalCO2e;
    } else if (typeof row.totalCO2e === "string") {
      const n = parseFloat(normalizeNumberString(row.totalCO2e));
      if (Number.isFinite(n)) out.totalCO2e = n;
    }
    if (typeof row.gpcRefNo === "string") {
      const ref = canonicalGpcRefNo(row.gpcRefNo, out.scope);
      if (ref) out.gpcRefNo = ref;
    }
    if (row.rowType === "line_item" || row.rowType === "subtotal") {
      out.rowType = row.rowType;
    } else if (row.rowType === "total") {
      out.rowType = "total";
    }
    if (typeof row.unit === "string" && !isPlaceholderOrEmpty(row.unit)) {
      out.unit = row.unit.trim();
    }
    if (
      typeof row.notationKey === "string" &&
      !isPlaceholderOrEmpty(row.notationKey)
    ) {
      // Keep the code only when it maps to a known notation key.
      if (toCanonical(row.notationKey))
        out.notationKey = row.notationKey.trim();
    }
    if (typeof row.co2 === "number" && Number.isFinite(row.co2)) {
      out.co2 = row.co2;
    } else if (typeof row.co2 === "string") {
      const n = parseFloat(normalizeNumberString(row.co2));
      if (Number.isFinite(n)) out.co2 = n;
    }
    if (typeof row.ch4 === "number" && Number.isFinite(row.ch4)) {
      out.ch4 = row.ch4;
    } else if (typeof row.ch4 === "string") {
      const n = parseFloat(normalizeNumberString(row.ch4));
      if (Number.isFinite(n)) out.ch4 = n;
    }
    if (typeof row.n2o === "number" && Number.isFinite(row.n2o)) {
      out.n2o = row.n2o;
    } else if (typeof row.n2o === "string") {
      const n = parseFloat(normalizeNumberString(row.n2o));
      if (Number.isFinite(n)) out.n2o = n;
    }
    if (typeof row.source === "string" && !isPlaceholderOrEmpty(row.source))
      out.source = row.source;
    if (
      typeof row.methodology === "string" &&
      !isPlaceholderOrEmpty(row.methodology)
    )
      out.methodology = row.methodology;
    if (
      typeof row.activityType === "string" &&
      !isPlaceholderOrEmpty(row.activityType)
    )
      out.activityType = row.activityType;
    if (
      typeof row.activityUnit === "string" &&
      !isPlaceholderOrEmpty(row.activityUnit)
    )
      out.activityUnit = row.activityUnit;
    if (
      typeof row.activityDataSource === "string" &&
      !isPlaceholderOrEmpty(row.activityDataSource)
    )
      out.activityDataSource = row.activityDataSource;
    if (
      typeof row.activityDataQuality === "string" &&
      !isPlaceholderOrEmpty(row.activityDataQuality)
    )
      out.activityDataQuality = row.activityDataQuality;
    if (
      typeof row.activityAmount === "number" &&
      Number.isFinite(row.activityAmount)
    ) {
      out.activityAmount = row.activityAmount;
    } else if (
      typeof row.activityAmount === "string" &&
      !isPlaceholderOrEmpty(row.activityAmount)
    ) {
      const n = parseFloat(normalizeNumberString(row.activityAmount));
      if (Number.isFinite(n)) out.activityAmount = n;
    }
    return out;
  });
}

/**
 * Fill gpcRefNo for rows that have sector/subsector but no GPC reference,
 * using the GPC resolver (name mappings + reference table).
 */
function fillMissingGpcRefNo(rows: ExtractedRow[]): ExtractedRow[] {
  return rows.map((row) => {
    const hasRef =
      row.gpcRefNo != null && String(row.gpcRefNo).trim().length > 0;
    if (hasRef) return row;

    const sector = row.sector?.trim() ?? "";
    const subsector = row.subsector?.trim() ?? "";
    const category = row.category?.trim();
    const resolved =
      sector || subsector
        ? resolveGpcRefNo(
            sector,
            subsector,
            category ?? undefined,
            row.scope ?? undefined,
          )
        : null;

    if (resolved) {
      return { ...row, gpcRefNo: resolved };
    }
    return row;
  });
}

/**
 * Use category value for activityType when activityType is empty (schema: category = Activity Type).
 */
function fillActivityTypeFromCategory(rows: ExtractedRow[]): ExtractedRow[] {
  return rows.map((row) => {
    if (row.activityType?.trim()) return row;
    if (row.category?.trim()) return { ...row, activityType: row.category };
    return row;
  });
}

/**
 * Fill derived fields while keeping document provenance separate from activity data provenance.
 */
export function normalizeExtractedRows(rows: ExtractedRow[]): ExtractedRow[] {
  return fillActivityTypeFromCategory(fillMissingGpcRefNo(rows));
}

/**
 * Multiplier from the unit written in the document to metric tonnes.
 * Empty unit means tonnes (rows stored before the unit field existed). Returns
 * null for a unit that cannot be converted safely (kg, lb, per-capita, %).
 * Exported for unit tests.
 */
export function tonnesMultiplier(unit?: string | null): number | null {
  if (unit == null) return 1;
  const raw = unit.trim();
  if (!raw) return 1;
  const cleaned = raw
    .replace(/co[2\u2082]\s*-?\s*(e|eq|equiv\w*)?/gi, "")
    .replace(/\bmetric\b/gi, "")
    .replace(/\bof\b/gi, "")
    .replace(/[()\s]/g, "");
  if (cleaned === "") return 1;
  // Case matters here: "Mt" is megatonnes, "mt" is a metric tonne.
  if (
    /^(Mt|Mtonnes?|megatonnes?|megatons?|milliontonnes?|milliontons?|million)$/.test(
      cleaned,
    )
  ) {
    return 1_000_000;
  }
  if (
    /^(kt|ktonnes?|kilotonnes?|kilotons?|thousandtonnes?|thousandtons?|thousand|gg|gigagrams?)$/i.test(
      cleaned,
    )
  ) {
    return 1000;
  }
  // "MT" in capitals is ambiguous (metric tonne or megatonne): do not guess.
  if (cleaned === "MT") return null;
  if (/^(t|mt|tonnes?|tons?)$/i.test(cleaned)) return 1;
  return null;
}

function scaleOrNull(
  value: number | null | undefined,
  multiplier: number,
): number | null | undefined {
  return value == null ? value : value * multiplier;
}

/** Sum of imported values in tonnes, without rows left out of totals (I.4.4). */
function sumImported(rows: ExtractedRow[]): number {
  return rows.reduce(
    (sum, row) =>
      row.gpcRefNo === GRID_GENERATION_GPC_REF || row.totalCO2e == null
        ? sum
        : sum + row.totalCO2e,
    0,
  );
}

/** Sub-sector key of a row: the GPC reference without its scope digit, else the names. */
function subsectorKeys(row: ExtractedRow): string[] {
  const keys: string[] = [];
  const ref = row.gpcRefNo?.trim();
  if (ref) {
    const parts = ref.split(".");
    keys.push(`ref:${parts.length >= 3 ? parts.slice(0, 2).join(".") : ref}`);
  }
  const subsector = row.subsector?.trim().toLowerCase();
  if (subsector) {
    keys.push(`name:${row.sector?.trim().toLowerCase() ?? ""}|${subsector}`);
  }
  return keys;
}

/**
 * Rows without a scope whose value equals the sum of the scoped rows of the same
 * sub-sector and year: within 0.5% for two or more rows, exactly for one row.
 * I.4.4 has no scope by design and is never a hidden total.
 * Exported for unit tests.
 */
export function findHiddenRowTotals(rows: ExtractedRow[]): Set<ExtractedRow> {
  // Per year, so a total of one year never hides a row of another.
  const keyed = (row: ExtractedRow) =>
    subsectorKeys(row).map((key) => `${row.year ?? ""}|${key}`);
  const scopedSums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (!row.scope || row.totalCO2e == null) continue;
    for (const key of keyed(row)) {
      const entry = scopedSums.get(key) ?? { sum: 0, count: 0 };
      entry.sum += row.totalCO2e;
      entry.count += 1;
      scopedSums.set(key, entry);
    }
  }
  const hidden = new Set<ExtractedRow>();
  for (const row of rows) {
    if (
      row.scope ||
      row.totalCO2e == null ||
      row.totalCO2e === 0 ||
      row.gpcRefNo?.trim() === GRID_GENERATION_GPC_REF
    ) {
      continue;
    }
    const value = row.totalCO2e;
    const isSum = keyed(row).some((key) => {
      const entry = scopedSums.get(key);
      if (entry == null) return false;
      // One scoped row: the Total column repeats it, so the match must be exact.
      if (entry.count === 1) return Math.abs(entry.sum - value) < 0.5;
      return Math.abs(entry.sum - value) <= Math.abs(value) * 0.005;
    });
    if (isSum) hidden.add(row);
  }
  return hidden;
}

/**
 * True when a total names a sector or sub-sector and equals, within the review
 * tolerance, the sum of the line items of that part. A sector name alone is not
 * enough: the model also writes a sector on the city total (seen live: "Other").
 */
function isSectorTotal(total: ReportedTotal, rows: ExtractedRow[]): boolean {
  const sector = total.sector?.trim().toLowerCase();
  const subsector = total.subsector?.trim().toLowerCase();
  if (!sector && !subsector) return false;
  const matchesSum = (inPart: (row: ExtractedRow) => boolean): boolean => {
    const matching = rows.filter(
      (row) =>
        row.gpcRefNo !== GRID_GENERATION_GPC_REF &&
        row.totalCO2e != null &&
        inPart(row),
    );
    if (matching.length === 0) return false;
    const sum = matching.reduce((s, row) => s + (row.totalCO2e as number), 0);
    return (
      Math.abs(sum - total.value) <=
      Math.abs(total.value) * RECONCILIATION_TOLERANCE
    );
  };
  const sameSector = (row: ExtractedRow) =>
    !sector || row.sector?.trim().toLowerCase() === sector;
  const sameSubsector = (row: ExtractedRow) =>
    !subsector || row.subsector?.trim().toLowerCase() === subsector;
  // The model may tag a sector total with one of its sub-sectors (seen on the
  // Masterton report: an agriculture total tagged Livestock), so try the sector too.
  return (
    matchesSum((row) => sameSector(row) && sameSubsector(row)) ||
    (!!sector && matchesSum(sameSector))
  );
}

/** Rows with the same key repeat one value (same year, reference, scope, activity). */
function repeatKey(row: ExtractedRow): string {
  return [
    row.year ?? "",
    row.gpcRefNo ?? `${row.sector ?? ""}|${row.subsector ?? ""}`,
    row.scope ?? "",
    (row.activityType ?? row.category ?? "").trim().toLowerCase(),
    row.notationKey ?? "",
  ].join("\t");
}

/**
 * Turn LLM rows into importable rows plus a reconciliation summary:
 * - subtotal and total rows leave the rows and go to reportedTotals;
 * - units are converted to tonnes, rows with an unknown unit are dropped;
 * - with a target year, rows of another year or without a year are dropped when
 *   any row names a year; only when no row names a year is the target year assumed;
 * - rows repeating the same year, reference, scope and activity are dropped.
 */
export type FinalizeOptions = {
  /**
   * Keep year-less rows as they are when no row names a year, instead of assigning
   * the target year. Page selection decides later, with every page in view.
   */
  deferYearAssumption?: boolean;
};

export function finalizeExtractedRows(
  rows: ExtractedRow[],
  targetYear?: number,
  options?: FinalizeOptions,
): ExtractionResult {
  const droppedRows: ExtractionSummary["droppedRows"] = {};
  const drop = (reason: DroppedRowReason) => {
    droppedRows[reason] = (droppedRows[reason] ?? 0) + 1;
  };
  const reportedTotals: ReportedTotal[] = [];
  const converted: ExtractedRow[] = [];

  for (const row of rows) {
    const multiplier = tonnesMultiplier(row.unit);
    if (multiplier == null) {
      drop("unsupported_unit");
      continue;
    }
    const scaled: ExtractedRow = { ...row };
    if (multiplier !== 1) {
      scaled.totalCO2e = scaleOrNull(row.totalCO2e, multiplier) ?? null;
      if (row.co2 != null) scaled.co2 = row.co2 * multiplier;
      if (row.ch4 != null) scaled.ch4 = row.ch4 * multiplier;
      if (row.n2o != null) scaled.n2o = row.n2o * multiplier;
    }
    if (row.unit) scaled.unit = "t";
    // A huge value in Mt can overflow to Infinity; it is not a usable number.
    if (
      [scaled.totalCO2e, scaled.co2, scaled.ch4, scaled.n2o].some(
        (v) => v != null && !Number.isFinite(v),
      )
    ) {
      drop("unsupported_unit");
      continue;
    }

    const labelLevel = sumLabelLevel(row);
    const rowType: ExtractedRowType | null | undefined =
      labelLevel && (row.rowType == null || row.rowType === "line_item")
        ? labelLevel
        : row.rowType;

    if (rowType === "subtotal" || rowType === "total") {
      drop("subtotal_or_total");
      if (
        scaled.totalCO2e != null &&
        reportedTotals.length < MAX_REPORTED_TOTALS
      ) {
        reportedTotals.push({
          label:
            scaled.category?.trim() ||
            scaled.subsector?.trim() ||
            scaled.sector?.trim() ||
            rowType,
          value: scaled.totalCO2e,
          year: scaled.year,
          scope: scaled.scope ?? null,
          sector: scaled.sector,
          subsector: scaled.subsector,
          level: rowType,
        });
      }
      continue;
    }
    converted.push(scaled);
  }

  let yearAssumed = false;
  let yearFiltered = converted;
  if (targetYear != null) {
    const anyExplicitYear = converted.some((row) => row.year != null);
    if (anyExplicitYear) {
      yearFiltered = [];
      for (const row of converted) {
        if (row.year === targetYear) yearFiltered.push(row);
        else if (row.year == null) drop("missing_year");
        else drop("other_year");
      }
    } else if (!options?.deferYearAssumption) {
      yearFiltered = converted.map((row) => ({ ...row, year: targetYear }));
      yearAssumed = yearFiltered.length > 0;
    }
  }

  // A "Total" column read as a line item: no scope, and its value is the sum of the
  // scoped rows of the same sub-sector. Keep it for reconciliation only. Runs after
  // the year filter so rows of other years do not count.
  const hiddenTotals = findHiddenRowTotals(yearFiltered);
  for (const row of hiddenTotals) {
    drop("subtotal_or_total");
    if (reportedTotals.length < MAX_REPORTED_TOTALS) {
      reportedTotals.push({
        label: row.category?.trim() || row.subsector?.trim() || "subtotal",
        value: row.totalCO2e as number,
        year: row.year,
        scope: null,
        sector: row.sector,
        subsector: row.subsector,
        level: "subtotal",
      });
    }
  }
  const kept = yearFiltered.filter((row) => !hiddenTotals.has(row));

  // A "total" naming a sector or sub-sector that equals the line items of that part
  // on this page is a sector total. The model sometimes types it "total" or labels
  // it "Total"; left as a grand total it can select one dominant sector alone.
  for (const total of reportedTotals) {
    if (isGrandTotal(total) && isSectorTotal(total, kept)) {
      total.level = "subtotal";
    }
  }

  const seen = new Set<string>();
  const finalRows: ExtractedRow[] = [];
  for (const row of kept) {
    const key = repeatKey(row);
    if (seen.has(key)) {
      drop("duplicate");
      continue;
    }
    seen.add(key);
    finalRows.push(row);
  }

  const importedSum = sumImported(finalRows);

  return {
    rows: finalRows,
    summary: {
      reportedTotals,
      droppedRows,
      importedSum,
      yearAssumed,
      targetYear: targetYear ?? null,
    },
  };
}
