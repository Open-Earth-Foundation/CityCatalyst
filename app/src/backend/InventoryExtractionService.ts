/**
 * Path C: Extract GHG inventory line items from document text using the LLM wrapper.
 * Output shape matches pdf-emissions-reports-analysis schema (year, sector, subsector, category, totalCO2e, etc.).
 * Prompts ask for canonical sector/subsector names and GPC reference numbers when present in the document.
 */

import { createLLMClient, LLMError, LLMErrorCode } from "@/backend/llm";
import { resolveGpcRefNo } from "@/util/GHGI/gpc-ref-resolver";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import gpcNameMappings from "@/util/GHGI/data/gpc-name-mappings.json";

type GpcRow = { sector: string; subsector: string };
const gpcTable = gpcReferenceTable as GpcRow[];

type NameMappings = { sector: Record<string, string>; subsector: Record<string, string> };
const nameMappings = gpcNameMappings as NameMappings;

/** Turn a slug (e.g. "on-road-transportation") into display form for the prompt ("On-road transportation"). */
function slugToDisplay(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  .map(
    ([sector, subs]) =>
      `- ${sector}: ${subs.join(", ")}`,
  )
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

const SYSTEM_PROMPT = `You extract GHG inventory line items from city emissions reports. Output a JSON array of objects. Each object = one line item: one category (or sector/subsector/category) for one year with emissions in metric tonnes CO2e.

Required fields: year (integer), sector, subsector, category, totalCO2e (number). Optional: gpcRefNo, co2, ch4, n2o, source. Use null for missing values.

Activity/methodology data (optional – include when the report provides them so we can store activity-level detail): methodology (e.g. "Fuel Sales", "Direct Measure", "Geographic or territorial"), activityAmount (number, e.g. fuel consumed, distance travelled), activityUnit (e.g. "tonnes", "litres", "km", "GJ"), activityType (e.g. fuel or vehicle type: "Diesel", "Natural gas", "Gasoline"), activityDataSource (text description of data source), activityDataQuality ("high", "medium", or "low"). Use null when not present in the report.

GPC taxonomy – sector and subsector must form a valid pair from this hierarchy (subsectors belong only under the sector listed):
${HIERARCHY_TEXT}

Mapping dictionary – when the report uses these terms, use the canonical name given so (sector, subsector) stays valid in the hierarchy above:
- Sector terms (report wording → use this sector): ${SECTOR_DICTIONARY_TEXT || "(none)"}
- Subsector terms (report wording → use this subsector): ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}

Rules: (1) Use only sector and subsector names that appear in the hierarchy. (2) The subsector must belong under the sector you chose (e.g. "Residential buildings" only under "Stationary Energy"). (3) If the report says "Buildings" or "Commercial", use the dictionary to pick the correct canonical sector and subsector.

GPC reference numbers: If the document shows a GPC reference code (e.g. I.1.1, I.2.1, II.1.1, III.1.2, IV.1, V.1), put it in the gpcRefNo field for that row. Format is Roman numeral(s).digit.digit (e.g. I.1.1, II.2.1). If not present in the source, leave gpcRefNo null.

Output only the JSON array, no markdown or explanation.`;

// Section 5.2 (pdf-emissions-reports-analysis.md): User prompt – focus on tables, ignore narrative-only pages
const USER_PROMPT_PREFIX = `Extract all GHG inventory line items from the following document.
- Focus on tables that list emissions by category and year.
- Ignore narrative-only pages if they contain no emission numbers.
Output one row per (category, year) with emissions in metric tonnes CO2e.\n\n`;

/** Max document length to send to LLM (chars) to avoid token limits. */
const MAX_DOCUMENT_CHARS = 120_000;

/**
 * Extract inventory rows from document text using the configured LLM.
 * @param documentContent - Raw text from PDF (or other source)
 * @returns Array of normalized row objects; throws on parse or LLM failure
 */
export async function extractInventoryRowsFromDocument(
  documentContent: string,
): Promise<ExtractedRow[]> {
  const content =
    documentContent.length > MAX_DOCUMENT_CHARS
      ? documentContent.slice(0, MAX_DOCUMENT_CHARS) +
        "\n\n[Document truncated for length.]"
      : documentContent;

  const client = createLLMClient();
  const { content: responseContent } = await client.complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: USER_PROMPT_PREFIX + content },
    ],
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 16000,
  });

  const parsed = parseExtractionResponse(responseContent);
  const rows = normalizeRows(parsed);
  return fillMissingGpcRefNo(rows);
}

/**
 * Extract the first JSON array from LLM response. Handles markdown code blocks,
 * leading/trailing text, and object wrappers like {"data": [...]}.
 */
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
    // Try common wrapper keys first
    const candidate =
      obj.data ??
      obj.rows ??
      obj.items ??
      obj.array ??
      obj.result ??
      obj.inventory ??
      obj.entries ??
      obj.line_items ??
      obj.lineItems ??
      obj.extracted ??
      obj.emissions;
    if (Array.isArray(candidate)) {
      arr = candidate;
    } else {
      // Fallback: use the first array value found in the object (any key)
      const firstArray = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(firstArray)) {
        arr = firstArray;
      } else {
        throw new LLMError(
          "Extraction response was not a JSON array",
          LLMErrorCode.BAD_REQUEST,
        );
      }
    }
  } else {
    throw new LLMError(
      "Extraction response was not a JSON array",
      LLMErrorCode.BAD_REQUEST,
    );
  }

  return arr.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
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
    if (typeof row.category === "string") out.category = row.category;
    if (typeof row.totalCO2e === "number" && Number.isFinite(row.totalCO2e)) {
      out.totalCO2e = row.totalCO2e;
    } else if (typeof row.totalCO2e === "string") {
      const n = parseFloat(row.totalCO2e.replace(/,/g, ""));
      if (Number.isFinite(n)) out.totalCO2e = n;
    }
    if (typeof row.gpcRefNo === "string") out.gpcRefNo = row.gpcRefNo;
    if (typeof row.co2 === "number" && Number.isFinite(row.co2)) out.co2 = row.co2;
    if (typeof row.ch4 === "number" && Number.isFinite(row.ch4)) out.ch4 = row.ch4;
    if (typeof row.n2o === "number" && Number.isFinite(row.n2o)) out.n2o = row.n2o;
    if (typeof row.source === "string") out.source = row.source;
    if (typeof row.methodology === "string") out.methodology = row.methodology;
    if (typeof row.activityType === "string") out.activityType = row.activityType;
    if (typeof row.activityUnit === "string") out.activityUnit = row.activityUnit;
    if (typeof row.activityDataSource === "string") out.activityDataSource = row.activityDataSource;
    if (typeof row.activityDataQuality === "string") out.activityDataQuality = row.activityDataQuality;
    if (typeof row.activityAmount === "number" && Number.isFinite(row.activityAmount)) {
      out.activityAmount = row.activityAmount;
    } else if (typeof row.activityAmount === "string") {
      const n = parseFloat(String(row.activityAmount).replace(/,/g, ""));
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
      row.gpcRefNo != null &&
      String(row.gpcRefNo).trim().length > 0;
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
