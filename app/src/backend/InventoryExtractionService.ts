/**
 * Path C: Extract GHG inventory line items from document text using the LLM wrapper.
 * Output shape matches pdf-emissions-reports-analysis schema (year, sector, subsector, category, totalCO2e, etc.).
 * Prompts ask for canonical sector/subsector names and GPC reference numbers when present in the document.
 */

import { createLLMClient, LLMError, LLMErrorCode } from "@/backend/llm";
import { logger } from "@/services/logger";
import { resolveGpcRefNo } from "@/util/GHGI/gpc-ref-resolver";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import gpcNameMappings from "@/util/GHGI/data/gpc-name-mappings.json";

type GpcRow = { sector: string; subsector: string };
const gpcTable = gpcReferenceTable as GpcRow[];

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

const EXTRACTION_SCHEMA_FIELDS = [
  "year",
  "sector",
  "subsector",
  "scope",
  "category",
  "totalCO2e",
  "co2",
  "ch4",
  "n2o",
  "gpcRefNo",
  "source",
  "methodology",
  "activityAmount",
  "activityUnit",
  "activityType",
  "activityDataSource",
  "activityDataQuality",
] as const;

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
};

// Structured prompt per prompt-schema-authoring: <role>, <task>, <input>, <output>, <example_output>
const SYSTEM_PROMPT = `<role>
You are an extractor of GHG inventory line items from city emissions reports. You output only valid JSON with no commentary.
</role>

<task>
Extract emissions at the most granular level the document provides. Use only sector and subsector names from the hierarchy below; map report terms using the dictionary when given. Preserve numeric scale from column headers (e.g. "thousand tonnes" → multiply by 1000; "million" → multiply by 1e6). Extract scope as "1", "2", or "3" when the document indicates it. Process the full document; do not return an error object or refuse for length. Output a separate row for every line item (every activity, subsector, or sector total)—never a single aggregated row when the document has multiple.

Tables to use (full coverage only): Use only tables that present a full-coverage summary of emissions—i.e. a comprehensive inventory that covers multiple sectors and/or the full scope (e.g. citywide, all scopes, or a complete sector breakdown with multiple subsectors and activities). Typical titles: "Citywide GHG Emissions Summary", "Emissions by sector", "City-wide GHG emissions", "Full inventory", "Inventory summary", "Emissions by category" (when it covers all categories). Do NOT use: executive summary tables with only a single total; partial tables that cover only one sector or one topic; methodology-only text; targets/projections without full inventory figures; narrative sections; or any table that does not give a full-coverage emissions summary with row-by-row data for multiple sectors/subsectors/activities.

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
- documentText (string): Full report text, or a segment of a longer report. Use only tables that are full-coverage emissions summaries (comprehensive inventory). Tables may have year as columns (e.g. CY 2005, CY 2015 with sub-columns Consumed, tCO₂e)—then take the year from the column header and, for each table row, take totalCO2e and Consumed from that year column for that row only (many output rows, each with that row's value). Ignore partial tables, single-total summaries, and narrative. When the input is a segment, apply the same granularity rules (one row per activity/subsector/sector—never collapse to one total).
</input>

<output>
Return a single JSON object with one key "rows" whose value is an array of row objects. No other keys, no markdown, no "error" key. The "rows" array must have one object per inventory line item—typical reports produce many rows (do not collapse to a single row). Each object in "rows" has:
- year (integer): inventory year. When the table has columns by year (e.g. CY 2015), use the year from the column header (2015), not a cell value; every row extracted from that column gets that year.
- sector (string): canonical sector from hierarchy below.
- subsector (string): canonical subsector from hierarchy below; must belong under sector.
- category (string): activity/category name when at activity level (e.g. "Natural gas", "Diesel"); or "Subsector total" / subsector name when only subsector-level data exists.
- totalCO2e (number): emissions in metric tonnes CO2e for this row only—per activity when activity data exists, per subsector when only subsector data exists. Apply column unit (e.g. 48 in "thousand tonnes" column → 48000). Do not put the whole sector total on every row; each row gets the total for that activity or that subsector.
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
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Natural gas", "totalCO2e": 125000, "scope": "1", "gpcRefNo": "I.1.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 5", "methodology": null, "activityAmount": 5500000, "activityUnit": "GJ", "activityType": "Natural gas", "activityDataSource": null, "activityDataQuality": null},
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Electricity", "totalCO2e": 42000, "scope": "2", "gpcRefNo": "I.1.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 5", "methodology": null, "activityAmount": 12000, "activityUnit": "MWh", "activityType": "Electricity", "activityDataSource": null, "activityDataQuality": null},
  {"year": 2020, "sector": "Transportation", "subsector": "On Road Transportation", "category": "Diesel", "totalCO2e": 89000, "scope": "1", "gpcRefNo": "I.2.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 7", "methodology": null, "activityAmount": 25000, "activityUnit": "liters", "activityType": "Diesel", "activityDataSource": null, "activityDataQuality": null}
]}
</example_output>`;

/** User message prefix when no target year. When target year is set, year instruction is injected before document. */
const USER_PROMPT_PREFIX = `Document text:\n\n`;

/** Prefix when sending a segment of a longer document (chunked extraction). Reinforces same granularity as full-document. */
const SEGMENT_PROMPT_PREFIX = `The following text is one segment of a longer emissions report. Use only tables that present a full-coverage emissions summary (comprehensive inventory with multiple sectors/subsectors/activities)—e.g. "Citywide GHG Emissions Summary", "Emissions by sector", "Inventory summary". Ignore partial tables (single sector only), executive summary totals, methodology-only text, and tables that are not full-coverage. Apply the same granularity rules as for a full document:
- If this segment contains activity-level data (e.g. breakdown by fuel type, building type, category): extract one row per activity with totalCO2e for that activity; do not collapse to a single subsector or sector total.
- If this segment contains only subsector-level data: extract one row per subsector with totalCO2e for that subsector; set category to "Subsector total" or the subsector name.
- If this segment contains only sector-level totals: output one row per sector.
- Never output a single aggregated row when the segment shows multiple line items (multiple activities, subsectors, or sectors). Extract every row you see in the inventory tables.
- If the table has columns by year (e.g. CY 2015): year = the column header (2015); totalCO2e = tCO₂e from that column for that row; activityAmount = Consumed from that column; one output row per table row, do not collapse the year column into one total.
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
export async function extractInventoryRowsFromDocument(
  documentContent: string,
  options?: ExtractOptions,
): Promise<ExtractedRow[]> {
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
      ? `Extract only emissions data for the year ${targetYear}. Set year to ${targetYear} for every row; do not include other years.\n\n`
      : "";

  let allRows: ExtractedRow[];

  if (documentContent.length <= CHUNK_THRESHOLD) {
    const content =
      documentContent.length > MAX_DOCUMENT_CHARS
        ? documentContent.slice(0, MAX_DOCUMENT_CHARS) +
          "\n\n[Document truncated for length.]"
        : documentContent;
    allRows = await extractSegment(content, yearInstruction, false);
  } else {
    const chunks = splitIntoChunks(documentContent, CHUNK_SIZE, CHUNK_OVERLAP);
    logger.info(
      { chunkCount: chunks.length, totalChars: documentContent.length },
      "Extraction using chunks to avoid timeout",
    );
    const segmentPrefix = yearInstruction + SEGMENT_PROMPT_PREFIX;
    const perChunkRows: ExtractedRow[][] = [];
    const onProgress = options?.onChunkProgress;
    for (let i = 0; i < chunks.length; i++) {
      const rows = await extractSegment(chunks[i], segmentPrefix, true);
      perChunkRows.push(rows);
      if (onProgress) {
        await Promise.resolve(onProgress(i + 1, chunks.length));
      }
    }
    allRows = mergeAndDedupeRows(perChunkRows);
  }

  const withGpc = fillMissingGpcRefNo(allRows);
  let result = fillActivityTypeFromCategory(withGpc);

  if (targetYear != null && Number.isInteger(targetYear)) {
    const before = result.length;
    result = result.filter(
      (row) => row.year == null || row.year === targetYear,
    );
    result = result.map((row) => ({ ...row, year: targetYear }));
    if (before > 0 && result.length === 0) {
      logger.warn(
        { targetYear, rowsBeforeFilter: before },
        "All extracted rows dropped by targetYear filter (no matching year)",
      );
      throw new LLMError(
        "Inventory not found for the target year",
        LLMErrorCode.BAD_REQUEST,
      );
    }
  }

  if (result.length === 0) {
    logger.warn(
      {
        totalRowsBeforeFilter: allRows.length,
        targetYear: targetYear ?? null,
      },
      "Extraction produced zero rows: LLM may have returned empty array or no parseable rows",
    );
  }

  return result;
}

/**
 * Split content into overlapping chunks so no row is cut in the middle.
 */
function splitIntoChunks(
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

/**
 * Dedupe rows from multiple chunks (overlap can produce duplicates). Use a simple key.
 */
function mergeAndDedupeRows(perChunkRows: ExtractedRow[][]): ExtractedRow[] {
  const seen = new Set<string>();
  const out: ExtractedRow[] = [];
  for (const rows of perChunkRows) {
    for (const row of rows) {
      const key = [
        row.year ?? "",
        row.sector ?? "",
        row.subsector ?? "",
        row.category ?? "",
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
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 1,
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
          // Model returned a single row object instead of an array (e.g. gpt-5.2)
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
    if (typeof row.gpcRefNo === "string") out.gpcRefNo = row.gpcRefNo;
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
        ? resolveGpcRefNo(sector, subsector, category ?? undefined)
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
