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

const SYSTEM_PROMPT = `You extract GHG inventory line items from city emissions reports. The data hierarchy is: Sector → Subsector → Activity. Output a JSON array of objects. Each object = one line item at the activity level: one row per distinct activity within a subsector (e.g. per fuel type, per building type, per vehicle type, per category) for one year with emissions in metric tonnes CO2e.

Required fields: year (integer), sector, subsector, category, totalCO2e (number). Optional: gpcRefNo, co2, ch4, n2o, source. Use null for missing values. Never output the string "-", "N/A", "n/a", or similar for missing data; use JSON null only.

Activity level (critical for hierarchy): Always populate category and/or activityType so the third level (activity) is clear. Use category for the activity/category name from the report (e.g. "Residential Energy", "Natural gas", "Diesel", "Electricity", "All buildings"). Use activityType for the fuel/vehicle/segment type when the report breaks down by type (e.g. "Natural gas", "Gasoline", "Residential Energy"). When the report has a single total for a subsector with no breakdown, use a descriptive label such as the subsector name plus " total" or "All" (e.g. category: "Residential buildings total"). Never leave both category and activityType null when the report clearly describes what the row refers to.

Numeric accuracy (critical): totalCO2e, co2, ch4, n2o, and activityAmount must be the full numeric value in metric tonnes (or the unit stated). (1) Preserve scale: if the table says "48" in a column headed "thousand tonnes", "kt", "ktCO2e" or "000 tonnes", output 48000 not 48. If it says "2.5" under "million tonnes" or "Mt", output 2500000. (2) Strip only commas/spaces as thousands separators when reading (e.g. "48,000" or "48 000" → 48000) and output the resulting number. (3) Never drop magnitude: 48,000 tonnes is 48000, not 48. Check column headers and table footnotes for units (thousand, million, kt, Mt, Gg) and convert to metric tonnes before outputting.

Activity data (critical when tables include consumption/quantity columns): When the report has a column for consumption, quantity, or usage (e.g. "Consumed", "Consumption", "Quantity", "Usage", "Activity", "Source MMBtu", "Fuel consumed", "Energy consumed"), put that numeric value in activityAmount. Use the full number (strip commas: e.g. "555,115,513" → 555115513). When there is a "Units" column or the header indicates the unit (e.g. liters, kWh, GJ, MMBtu, kg, tonnes), put that in activityUnit. If the table has both tCO2e (or similar) and a consumption/quantity column, output both: totalCO2e from the emissions column and activityAmount from the consumption column for that same row and year. activityType is the fuel or activity name (e.g. "Natural gas", "#2 fuel oil", "Electricity"). Use null only when the report has no value for a field; do not output "-" or "N/A" as a string.
Other optional fields: methodology, activityDataSource, activityDataQuality. Use null when not present.

GPC taxonomy – sector and subsector must form a valid pair from this hierarchy (subsectors belong only under the sector listed):
${HIERARCHY_TEXT}

Mapping dictionary – when the report uses these terms, use the canonical name given so (sector, subsector) stays valid in the hierarchy above:
- Sector terms (report wording → use this sector): ${SECTOR_DICTIONARY_TEXT || "(none)"}
- Subsector terms (report wording → use this subsector): ${SUBSECTOR_DICTIONARY_TEXT || "(none)"}

Rules: (1) Use only sector and subsector names that appear in the hierarchy. (2) The subsector must belong under the sector you chose (e.g. "Residential buildings" only under "Stationary Energy"). (3) If the report says "Buildings" or "Commercial", use the dictionary to pick the correct canonical sector and subsector.

GPC reference numbers: If the document shows a GPC reference code (e.g. I.1.1, I.2.1, II.1.1, III.1.2, IV.1, V.1), put it in the gpcRefNo field for that row. Format is Roman numeral(s).digit.digit (e.g. I.1.1, II.2.1). If not present in the source, leave gpcRefNo null.

Output only the JSON array, no markdown or explanation.`;

// Section 5.2 (pdf-emissions-reports-analysis.md): User prompt – focus on tables, ignore narrative-only pages
const USER_PROMPT_PREFIX = `Extract all GHG inventory line items from the following document. Hierarchy: Sector → Subsector → Activity.
- Focus on tables that list emissions by category, fuel type, building type, or similar breakdown and by year.
- Output one row per activity (sector + subsector + category/activity type + year). When the report breaks down by fuel, building type, or category, output one row per such segment so the activity level is clear. When there is only an aggregate total for a subsector, use a clear category label (e.g. "Residential buildings total" or "All").
- Always set category and/or activityType to the name of that activity so the third level of the hierarchy is populated (e.g. "Residential Energy", "Natural gas", "Diesel").
- Ignore narrative-only pages if they contain no emission numbers.
- For every number: check the column or table header for unit (e.g. "thousand tonnes", "kt", "million", "Mt"). Convert to metric tonnes and output the full value (e.g. 48 in a "thousand tonnes" column → totalCO2e: 48000; 2.5 in "million tonnes" → 2500000). Do not output 48 when the source means 48,000.
- When the table has both an emissions column (tCO2e, etc.) and a consumption/quantity column (Consumed, Consumption, Quantity, Source MMBtu, etc.), extract both: totalCO2e from the emissions column and activityAmount from the consumption column. Use the "Units" column (or header) for activityUnit. Output numeric values without commas (e.g. 555115513 not "555,115,513").
- For missing or empty cells use JSON null; never output "-", "N/A", or similar as string values.\n\n`;

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
  const withGpc = fillMissingGpcRefNo(rows);
  return fillActivityTypeFromCategory(withGpc);
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

/** Strip commas and spaces used as thousands separators so "48,000" and "48 000" parse correctly. */
function normalizeNumberString(s: string): string {
  return String(s).replace(/,/g, "").replace(/\s+/g, "").trim();
}

/** Treat "-", "N/A", empty as missing (model sometimes outputs these instead of null). */
function isPlaceholderOrEmpty(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || t === "-" || t === "n/a" || t === "na" || t === "—";
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
    if (typeof row.source === "string" && !isPlaceholderOrEmpty(row.source)) out.source = row.source;
    if (typeof row.methodology === "string" && !isPlaceholderOrEmpty(row.methodology)) out.methodology = row.methodology;
    if (typeof row.activityType === "string" && !isPlaceholderOrEmpty(row.activityType)) out.activityType = row.activityType;
    if (typeof row.activityUnit === "string" && !isPlaceholderOrEmpty(row.activityUnit)) out.activityUnit = row.activityUnit;
    if (typeof row.activityDataSource === "string" && !isPlaceholderOrEmpty(row.activityDataSource)) out.activityDataSource = row.activityDataSource;
    if (typeof row.activityDataQuality === "string" && !isPlaceholderOrEmpty(row.activityDataQuality)) out.activityDataQuality = row.activityDataQuality;
    if (typeof row.activityAmount === "number" && Number.isFinite(row.activityAmount)) {
      out.activityAmount = row.activityAmount;
    } else if (typeof row.activityAmount === "string" && !isPlaceholderOrEmpty(row.activityAmount)) {
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
