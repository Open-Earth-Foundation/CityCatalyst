import JSZip from "jszip";

/** CIRIS eCRF_3 extras that must not show as "needs mapping". */
export const CIRIS_ECRF3_IGNORE_HEADERS = [
  "Active",
  "Row",
  "Sheet",
  "AD - Amount",
  "AD conversion - Default",
  "AD - override",
  "AD Unit",
  "AD conversion - EF Unit",
  "Description",
  "Description of method(s) used or explanation for using notation key(s)",
  "Fleet type",
  "Transport_method",
  "Type of waste",
  "Industrial process/Product use",
  "AD - Source",
  "AD - Data Quality",
  "EF - Unit",
  "EF - CO2",
  "EF- CH4",
  "EF - N2O",
  "EF - Total CO2e",
  "EF - Biogenic CO2",
  "Oxidation factor-default",
  "Oxidation factor-override",
  "Emission factor - Oxidation factor",
  "EF ID",
  "I.4.4 Sub-category",
] as const;

const CIRIS_SHEET_INDICATORS =
  /^(ciris|cdp|overview|summary|boundary|governance|city information|disclosure|questionnaire|report|home|gpc)$/i;

/** Sheets loaded for CIRIS Path A + Report reconciliation. Prefer exact eCRF_3. */
export const CIRIS_PARSE_SHEET_NAMES = [
  "eCRF_3",
  "Report",
  "Results_Overview",
] as const;

export function sheetNameLooksLikeEcrf3(name: string): boolean {
  return /^ecrf_3$/i.test(name.trim());
}

export function preferEcrf3SheetName(names: string[]): string | undefined {
  return (
    names.find((name) => name === "eCRF_3") ??
    names.find((name) => sheetNameLooksLikeEcrf3(name))
  );
}

/**
 * CIRIS Standard workbooks expose eCRF_3 plus CIRIS/CDP helper sheets.
 * Do not treat Light_eCRF_3 alone as enough.
 */
export function isCirisSheetList(sheetNames: string[]): boolean {
  const hasEcrf3 = sheetNames.some(sheetNameLooksLikeEcrf3);
  if (!hasEcrf3) return false;
  const hasCirisSheets = sheetNames.some((name) =>
    CIRIS_SHEET_INDICATORS.test(name.trim()),
  );
  return sheetNames.length > 5 || hasCirisSheets;
}

/** CIRIS-like workbook with no usable eCRF_3 (e.g. older packs without the tab). */
export function cirisMissingEcrf3(sheetNames: string[]): boolean {
  const looksCiris =
    sheetNames.some((name) => /^ciris$/i.test(name.trim())) ||
    sheetNames.some((name) => /cdp|disclosure|questionnaire/i.test(name));
  return looksCiris && !sheetNames.some(sheetNameLooksLikeEcrf3);
}

export function cirisSheetsToParse(sheetNames: string[]): string[] {
  const ecrf3 = preferEcrf3SheetName(sheetNames);
  const keep = new Set<string>();
  if (ecrf3) keep.add(ecrf3);
  for (const name of sheetNames) {
    if (/^report$/i.test(name) || /^results_overview$/i.test(name)) {
      keep.add(name);
    }
  }
  return [...keep];
}

export function isCirisIgnorableHeader(header: string): boolean {
  const normalized = header.trim().toLowerCase();
  if (!normalized) return false;
  // CIRIS sometimes emits a stray numeric header from a formula column.
  if (/^\d+(\.\d+)?$/.test(normalized)) return true;
  return CIRIS_ECRF3_IGNORE_HEADERS.some(
    (known) => known.toLowerCase() === normalized,
  );
}

/**
 * Read sheet names from an xlsx/xlsm zip without materializing cell data.
 */
export async function listSpreadsheetSheetNames(
  buffer: Buffer,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!workbookXml) return [];
  const names: string[] = [];
  const sheetTag =
    /<sheet\b[^>]*\bname="([^"]+)"[^>]*>|<sheet\b[^>]*\bname='([^']+)'[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = sheetTag.exec(workbookXml))) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (name) names.push(decodeXmlEntities(name));
  }
  return names;
}

function decodeXmlEntities(value: string): string {
  // Decode &amp; last so sequences like &amp;lt; stay a single unescape.
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Build a smaller xlsx that only contains the named worksheets so ExcelJS
 * never expands the full CIRIS template into memory.
 */
export async function filterSpreadsheetToSheets(
  buffer: Buffer,
  keepSheetNames: string[],
): Promise<Buffer> {
  if (keepSheetNames.length === 0) {
    throw new Error("At least one sheet must be kept");
  }
  const keep = new Set(keepSheetNames);
  const zip = await JSZip.loadAsync(buffer);
  const workbookPath = "xl/workbook.xml";
  const relsPath = "xl/_rels/workbook.xml.rels";
  const contentTypesPath = "[Content_Types].xml";
  const workbookXml = await zip.file(workbookPath)?.async("text");
  const relsXml = await zip.file(relsPath)?.async("text");
  const contentTypesXml = await zip.file(contentTypesPath)?.async("text");
  if (!workbookXml || !relsXml || !contentTypesXml) {
    throw new Error("Invalid spreadsheet package");
  }

  const sheets: { name: string; rId: string; fullTag: string }[] = [];
  const sheetTag =
    /<sheet\b[^>]*\/>|<sheet\b[^>]*>\s*<\/sheet>/gi;
  let match: RegExpExecArray | null;
  while ((match = sheetTag.exec(workbookXml))) {
    const fullTag = match[0];
    const name =
      decodeXmlEntities(
        /name="([^"]+)"/i.exec(fullTag)?.[1] ??
          /name='([^']+)'/i.exec(fullTag)?.[1] ??
          "",
      ).trim();
    const rId =
      /r:id="([^"]+)"/i.exec(fullTag)?.[1] ??
      /r:id='([^']+)'/i.exec(fullTag)?.[1] ??
      "";
    if (name && rId) sheets.push({ name, rId, fullTag });
  }

  const keptSheets = sheets.filter((sheet) => keep.has(sheet.name));
  if (keptSheets.length === 0) {
    throw new Error("Requested sheets were not found in the workbook");
  }

  const ridToTarget = new Map<string, string>();
  const relTag =
    /<Relationship\b[^>]*\/>|<Relationship\b[^>]*>\s*<\/Relationship>/gi;
  while ((match = relTag.exec(relsXml))) {
    const tag = match[0];
    const id =
      /Id="([^"]+)"/i.exec(tag)?.[1] ?? /Id='([^']+)'/i.exec(tag)?.[1] ?? "";
    const target =
      /Target="([^"]+)"/i.exec(tag)?.[1] ??
      /Target='([^']+)'/i.exec(tag)?.[1] ??
      "";
    if (id && target) ridToTarget.set(id, target.replace(/^\.\//, ""));
  }

  const keptTargets = new Set<string>();
  for (const sheet of keptSheets) {
    const target = ridToTarget.get(sheet.rId);
    if (target) keptTargets.add(target.replace(/^\/+/, ""));
  }

  // Drop worksheet parts that are not kept.
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalized = path.replace(/^\/+/, "");
    if (!normalized.startsWith("xl/worksheets/")) continue;
    if (normalized.includes("/_rels/")) continue;
    const relative = normalized.slice("xl/".length);
    if (!keptTargets.has(relative) && !keptTargets.has(normalized)) {
      zip.remove(path);
      const base = relative.split("/").pop();
      const sheetRels = `xl/worksheets/_rels/${base}.rels`;
      if (zip.file(sheetRels)) zip.remove(sheetRels);
    }
  }

  // ExcelJS crashes if sheet drawing/vml rels point at parts we do not need.
  // Strip those relationships, drawing tags in sheet XML, and drop media/vba.
  for (const sheet of keptSheets) {
    const target = ridToTarget.get(sheet.rId);
    if (!target) continue;
    const sheetPath = target.startsWith("xl/")
      ? target
      : `xl/${target.replace(/^\/+/, "")}`;
    const base = target.split("/").pop();
    const sheetXml = await zip.file(sheetPath)?.async("text");
    if (sheetXml) {
      const cleanedSheet = sheetXml
        .replace(/<drawing\b[^>]*\/>/gi, "")
        .replace(/<drawing\b[^>]*>[\s\S]*?<\/drawing>/gi, "")
        .replace(/<legacyDrawing\b[^>]*\/>/gi, "")
        .replace(/<legacyDrawingHF\b[^>]*\/>/gi, "")
        .replace(/<oleObjects\b[^>]*>[\s\S]*?<\/oleObjects>/gi, "")
        .replace(/<controls\b[^>]*>[\s\S]*?<\/controls>/gi, "");
      zip.file(sheetPath, cleanedSheet);
    }
    const sheetRelsPath = `xl/worksheets/_rels/${base}.rels`;
    const sheetRelsXml = await zip.file(sheetRelsPath)?.async("text");
    if (!sheetRelsXml) continue;
    const cleaned = sheetRelsXml.replace(relTag, (tag) => {
      const relType =
        /Type="([^"]+)"/i.exec(tag)?.[1] ??
        /Type='([^']+)'/i.exec(tag)?.[1] ??
        "";
      if (
        /drawing|vml|chart|hyperlink|printerSettings|oleObject|ctrlProp/i.test(
          relType,
        )
      ) {
        return "";
      }
      return tag;
    });
    zip.file(sheetRelsPath, cleaned);
  }

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (
      /^xl\/(drawings|charts|media|embeddings|activeX|printerSettings|cdata)\//i.test(
        path,
      ) ||
      /vbaProject/i.test(path) ||
      /xl\/calcChain\.xml$/i.test(path)
    ) {
      zip.remove(path);
    }
  }

  const sheetsXml = keptSheets
    .map((sheet, index) =>
      sheet.fullTag
        .replace(/\bsheetId="[^"]*"/i, `sheetId="${index + 1}"`)
        .replace(/\bsheetId='[^']*'/i, `sheetId='${index + 1}'`),
    )
    .join("");
  let nextWorkbookXml = workbookXml.replace(
    /<sheets\b[^>]*>[\s\S]*?<\/sheets>/i,
    `<sheets>${sheetsXml}</sheets>`,
  );
  // Drop workbook-level drawing/vba pointers that confuse ExcelJS after pruning.
  nextWorkbookXml = nextWorkbookXml
    .replace(/<vbaProject[^>]*\/>/gi, "")
    .replace(/<legacyDrawing[^>]*\/>/gi, "");
  zip.file(workbookPath, nextWorkbookXml);

  // Keep only relationships for retained sheets (plus non-worksheet/core rels).
  const keptRels = new Set(keptSheets.map((sheet) => sheet.rId));
  const nextRels = relsXml.replace(relTag, (tag) => {
    const id =
      /Id="([^"]+)"/i.exec(tag)?.[1] ?? /Id='([^']+)'/i.exec(tag)?.[1] ?? "";
    const target =
      /Target="([^"]+)"/i.exec(tag)?.[1] ??
      /Target='([^']+)'/i.exec(tag)?.[1] ??
      "";
    if (/worksheets\//i.test(target) && !keptRels.has(id)) return "";
    if (/vbaProject|drawings\/|charts\//i.test(target)) return "";
    return tag;
  });
  zip.file(relsPath, nextRels);

  let nextContentTypes = contentTypesXml.replace(
    /<Override\b[^>]*PartName="\/xl\/worksheets\/[^"]+"[^>]*\/>/gi,
    (tag) => {
      const part =
        /PartName="([^"]+)"/i.exec(tag)?.[1]?.replace(/^\//, "") ?? "";
      const relative = part.startsWith("xl/") ? part.slice(3) : part;
      return keptTargets.has(relative) || keptTargets.has(part) ? tag : "";
    },
  );
  nextContentTypes = nextContentTypes.replace(
    /<Override\b[^>]*PartName="\/xl\/(drawings|charts|media|embeddings|activeX|printerSettings|cdata)\/[^"]+"[^>]*\/>/gi,
    "",
  );
  nextContentTypes = nextContentTypes.replace(
    /<Override\b[^>]*PartName="[^"]*vbaProject[^"]*"[^>]*\/>/gi,
    "",
  );
  zip.file(contentTypesPath, nextContentTypes);

  return Buffer.from(
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
}

function numericCell(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Best-effort city total from CIRIS Results_Overview / Report rows.
 * Prefers a row whose label is exactly TOTAL (Overview BASIC/BASIC+).
 */
export function extractCirisReportTotalTonnes(
  rows: Record<string, string | number | null>[],
): number | undefined {
  let exactTotal: number | undefined;
  let labeledTotal: number | undefined;

  for (const row of rows) {
    const values = Object.values(row);
    const texts = values.map((value) => String(value ?? "").trim());
    const isExactTotalRow = texts.some((text) => /^total$/i.test(text));
    const label = texts.join(" ").toLowerCase();
    const looksLikeTotal =
      isExactTotalRow ||
      /\b(grand total|city total|inventory total|ghg total|emisiones totales)\b/.test(
        label,
      );
    if (!looksLikeTotal) continue;

    for (const value of values) {
      const parsed = numericCell(value);
      // Ignore population / GDP-scale noise and tiny placeholders.
      if (parsed == null || parsed < 10_000) continue;
      if (isExactTotalRow) {
        exactTotal =
          exactTotal == null ? parsed : Math.max(exactTotal, parsed);
      } else {
        labeledTotal =
          labeledTotal == null ? parsed : Math.max(labeledTotal, parsed);
      }
    }
  }

  return exactTotal ?? labeledTotal;
}

/** Prefer Results_Overview (cached BASIC totals) over Report (often formula-only). */
export function extractCirisWorkbookTotalTonnes(
  sheets: Array<{ name: string; rows: Record<string, string | number | null>[] }>,
): number | undefined {
  const overview = sheets.find((sheet) =>
    /^results_overview$/i.test(sheet.name),
  );
  const report = sheets.find((sheet) => /^report$/i.test(sheet.name));
  return (
    (overview ? extractCirisReportTotalTonnes(overview.rows) : undefined) ??
    (report ? extractCirisReportTotalTonnes(report.rows) : undefined)
  );
}

/** Sum eCRF_3 importable totals, excluding GPC refs left out of inventory totals. */
export function sumCirisEcrfImportedTonnes(
  rows: Array<{
    gpcRefNo?: string;
    totalCO2e?: number;
    co2?: number;
    ch4?: number;
    n2o?: number;
    errors?: string[];
    omitFromTotal?: boolean;
  }>,
  isOmitted: (gpcRefNo?: string | null) => boolean,
): number {
  let sum = 0;
  for (const row of rows) {
    if (row.errors && row.errors.length > 0) continue;
    if (row.omitFromTotal || isOmitted(row.gpcRefNo)) continue;
    const value =
      typeof row.totalCO2e === "number" && Number.isFinite(row.totalCO2e)
        ? row.totalCO2e
        : [row.co2, row.ch4, row.n2o].reduce<number>(
            (acc, part) =>
              acc + (typeof part === "number" && Number.isFinite(part) ? part : 0),
            0,
          );
    if (value !== 0) sum += value;
  }
  return sum;
}
