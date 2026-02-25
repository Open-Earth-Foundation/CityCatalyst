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

/** Turn a slug (e.g. "on-road-transportation") into display form for the prompt ("On-road transportation"). */
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
Extract emissions at the most granular level the document provides. Use only sector and subsector names from the hierarchy below; map report terms using the dictionary when given. Preserve numeric scale from column headers (e.g. "thousand tonnes" → multiply by 1000; "million" → multiply by 1e6). Extract scope as "1", "2", or "3" when the document indicates it. Process the full document; do not return an error object or refuse for length.

Granularity (critical):
- If the report has activity-level data (breakdown by fuel type, building type, category, or similar within a subsector): extract one row per activity with totalCO2e for that activity. Do not collapse to a single sector or subsector total when activity breakdown exists.
- If the report has only subsector-level data (no activity breakdown): extract one row per subsector with totalCO2e for that subsector; set category to a label like "Subsector total" or the subsector name.
- If the report has only sector-level totals (no subsector or activity breakdown): then output one row per sector with that sector total.
- Never output only the whole-sector total when the table actually shows subsector or activity breakdown—always extract each subsector and each activity row with its own totalCO2e.
</task>

<input>
- documentText (string): Full or truncated report text. May contain tables with emissions by category, fuel type, building type, and year. Focus on tables; ignore narrative-only content with no numbers.
</input>

<output>
Return a JSON array of objects only. No markdown, no wrapper object, no "error" key. Each object has:
- year (integer): inventory year.
- sector (string): canonical sector from hierarchy below.
- subsector (string): canonical subsector from hierarchy below; must belong under sector.
- category (string): activity/category name when at activity level (e.g. "Natural gas", "Diesel"); or "Subsector total" / subsector name when only subsector-level data exists.
- totalCO2e (number): emissions in metric tonnes CO2e for this row only—per activity when activity data exists, per subsector when only subsector data exists. Apply column unit (e.g. 48 in "thousand tonnes" column → 48000). Do not put the whole sector total on every row; each row gets the total for that activity or that subsector.
- scope (string | null): "1", "2", or "3" when present in document; else null.
- gpcRefNo (string | null): e.g. I.1.1, II.2.1 when present; else null.
- co2, ch4, n2o (number | null): gas breakdown when present.
- source, methodology (string | null): when present.
- activityAmount (number | null): consumption/quantity value when table has such column; strip commas.
- activityUnit (string | null): e.g. liters, kWh, GJ from "Units" or header.
- activityType (string | null): fuel/activity name when present.
- activityDataSource, activityDataQuality (string | null): when present.
Use JSON null for missing values. Never output "-", "N/A", or similar as strings.
</output>

<taxonomy>
Sector → Subsector hierarchy (use only these pairs):
${HIERARCHY_TEXT}

Mapping (report term → use this): Sector: ${SECTOR_DICTIONARY_TEXT || "(none)"}. Subsector: ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}.
</taxonomy>

<example_output>
[
  {"year": 2020, "sector": "Stationary Energy", "subsector": "Residential Buildings", "category": "Natural gas", "totalCO2e": 125000, "scope": "1", "gpcRefNo": "I.1.1", "co2": null, "ch4": null, "n2o": null, "source": "Table 5", "methodology": null, "activityAmount": 5500000, "activityUnit": "GJ", "activityType": "Natural gas", "activityDataSource": null, "activityDataQuality": null}
]
</example_output>`;

/** User message prefix when no target year. When target year is set, year instruction is injected before document. */
const USER_PROMPT_PREFIX = `Document text:\n\n`;

/** Max document length to send to LLM (chars) to avoid token limits. */
const MAX_DOCUMENT_CHARS = 120_000;

export type ExtractOptions = {
  /** When set, prompt and filter so only rows for this year are returned (inventory year). */
  targetYear?: number;
};

/**
 * Extract inventory rows from document text using the configured LLM.
 * @param documentContent - Raw text from PDF (or other source)
 * @param options - Optional targetYear to extract only that year (e.g. inventory year)
 * @returns Array of normalized row objects; throws on parse or LLM failure
 */
export async function extractInventoryRowsFromDocument(
  documentContent: string,
  options?: ExtractOptions,
): Promise<ExtractedRow[]> {
  const content =
    documentContent.length > MAX_DOCUMENT_CHARS
      ? documentContent.slice(0, MAX_DOCUMENT_CHARS) +
        "\n\n[Document truncated for length.]"
      : documentContent;

  const targetYear = 2015;
  const yearInstruction =
    targetYear != null
      ? `Extract only emissions data for the year ${targetYear}. Set year to ${targetYear} for every row; do not include other years.\n\n`
      : "";

  const userContent = yearInstruction + USER_PROMPT_PREFIX + content;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    jsonMode: true,
    temperature: 0,
    maxTokens: 16000,
  });

  const truncated =
    responseContent.length > EXTRACTION_LOG_LIMIT
      ? responseContent.slice(0, EXTRACTION_LOG_LIMIT) +
        `...[truncated, total ${responseContent.length} chars]`
      : responseContent;
  logger.debug({ extractionResponse: truncated }, "Extraction LLM output");

  const parsed = parseExtractionResponse(responseContent);
  const rows = normalizeRows(parsed);
  const withGpc = fillMissingGpcRefNo(rows);
  let result = fillActivityTypeFromCategory(withGpc);

  if (targetYear != null && Number.isInteger(targetYear)) {
    result = result.filter(
      (row) => row.year == null || row.year === targetYear,
    );
    result = result.map((row) => ({ ...row, year: targetYear }));
  }

  return result;
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

  // If there's trailing text after the JSON, extract the outermost bracket pair
  const open = jsonStr[0];
  const close = open === "[" ? "]" : "}";
  if (open === "[" || open === "{") {
    let depth = 0;
    let end = -1;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === open) depth++;
      else if (jsonStr[i] === close) {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > 0) jsonStr = jsonStr.slice(0, end);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Last resort: find a top-level JSON array in the string (e.g. "Text\n[...]")
    const arrayStart = jsonStr.indexOf("[");
    if (arrayStart >= 0) {
      let depth = 0;
      for (let i = arrayStart; i < jsonStr.length; i++) {
        if (jsonStr[i] === "[") depth++;
        else if (jsonStr[i] === "]") {
          depth--;
          if (depth === 0) {
            try {
              parsed = JSON.parse(jsonStr.slice(arrayStart, i + 1));
              break;
            } catch {
              /* ignore */
            }
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
