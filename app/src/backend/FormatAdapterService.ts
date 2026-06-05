/**
 * FormatAdapterService — deterministic pre-processors for non-eCRF tabular inventory files.
 *
 * Four adapter families, each normalising a raw file into a clean flat ParsedFileData that
 * the existing AI interpretation pipeline can consume, or (Adapter D) directly into
 * ExtractedRow[] objects without needing AI at all.
 *
 * Adapter A  (long-tidy)    – one row per sector × year: community-ghg, LGO, Greenhouse_Gas_Inventory CSVs
 * Adapter B  (wide-year)    – year-as-columns matrix: NYC inventory, city-wide emissions CSVs
 * Adapter C  (multi-sheet)  – XLSX workbooks with Scope/fuel sheets: resource_267, LGO .xls reports
 * Adapter D  (near-ecrf)    – already has GPC ref columns: inventory-BR RNO-2023 style
 */

import FileParserService, {
  type ParsedFileData,
  type ParsedSheet,
} from "./FileParserService";
import type { ExtractedRow } from "./InventoryExtractionService";
import {
  resolveGpcRefNo,
  splitSectorSubsectorLabels,
} from "@/util/GHGI/gpc-ref-resolver";

// ─── Public types ────────────────────────────────────────────────────────────

export type AdapterType = "near-ecrf" | "long-tidy" | "wide-year" | "multi-sheet";

export interface AdapterDetectionResult {
  /** Which adapter family was matched, or null if the file looks like standard eCRF. */
  adapterType: AdapterType | null;
  /** True when the file contains data for more than one city/organization. */
  isMultiCity: boolean;
  /** Informational metadata discovered during detection. */
  detectedYearColumn?: string;
  detectedSectorColumn?: string;
  detectedEmissionsColumn?: string;
  warnings: string[];
}

// ─── GPC sector prefix table ──────────────────────────────────────────────────

const GPC_SECTOR_BY_PREFIX: Record<string, string> = {
  I: "Stationary Energy",
  II: "Transportation",
  III: "Waste",
  IV: "Industrial Processes and Product Use",
  V: "Agriculture, Forestry and Other Land Use",
};

// ─── Service ──────────────────────────────────────────────────────────────────

export default class FormatAdapterService {
  // ── Detection ──────────────────────────────────────────────────────────────

  /**
   * Detect which adapter family matches this file.
   * Call this after parsing but before routing to Path A or B.
   */
  public static detect(parsedData: ParsedFileData): AdapterDetectionResult {
    const primary = parsedData.primarySheet;
    const warnings: string[] = [];

    if (!primary || primary.headers.length === 0) {
      return { adapterType: null, isMultiCity: false, warnings };
    }

    const headers = primary.headers;
    const headersLower = headers.map((h) => h.toLowerCase().trim());

    // Multi-city check (independent – does not affect adapter selection)
    const isMultiCity = this.detectMultiCity(primary, headers);
    if (isMultiCity) {
      warnings.push(
        "File appears to contain data for multiple cities/organizations. " +
          "Please ensure you upload a single-city inventory.",
      );
    }

    // ── Adapter D (near-ecrf): already has GPC ref + notation columns ─────
    if (this.isNearECRF(headersLower)) {
      return { adapterType: "near-ecrf", isMultiCity, warnings };
    }

    // ── Adapter B (wide-year): 3+ headers containing a 4-digit year ────────
    const wideYearCol = this.detectWideYearColumn(headersLower);
    if (wideYearCol) {
      return {
        adapterType: "wide-year",
        isMultiCity,
        detectedYearColumn: wideYearCol,
        warnings,
      };
    }

    // ── Adapter A (long-tidy): explicit Year + Sector + Emissions columns ──
    const longTidy = this.detectLongTidy(primary, headers, headersLower);
    if (longTidy) {
      return {
        adapterType: "long-tidy",
        isMultiCity,
        detectedYearColumn: longTidy.yearCol,
        detectedSectorColumn: longTidy.sectorCol,
        detectedEmissionsColumn: longTidy.emissionsCol,
        warnings,
      };
    }

    // ── Adapter C (multi-sheet workbook): XLSX with scope/fuel sheets ───────
    if (parsedData.fileType === "xlsx" && this.isMultiSheetWorkbook(parsedData)) {
      return { adapterType: "multi-sheet", isMultiCity, warnings };
    }

    return { adapterType: null, isMultiCity, warnings };
  }

  // ── Normalization ──────────────────────────────────────────────────────────

  /**
   * Normalize a detected-adapter file into a clean single-sheet ParsedFileData.
   * The result is suitable for the existing AI table-shaping pipeline (Path B).
   * Not used for Adapter D (use toExtractedRows() instead).
   */
  public static normalize(
    parsedData: ParsedFileData,
    adapterType: AdapterType,
    targetYear?: number,
  ): ParsedFileData {
    switch (adapterType) {
      case "long-tidy":
        return this.normalizeLongTidy(parsedData, targetYear);
      case "wide-year":
        return this.normalizeWideYear(parsedData, targetYear);
      case "multi-sheet":
        return this.normalizeMultiSheet(parsedData);
      case "near-ecrf":
        // Adapter D is handled directly via toExtractedRows; return as-is if called here
        return parsedData;
    }
  }

  // ── Adapter D: direct ExtractedRow mapping (no AI required) ──────────────

  /**
   * Directly map near-ecrf rows to ExtractedRow[] without LLM involvement.
   * Works for files with GPC Reference Number and/or CRF Sector + Sub-sector columns.
   */
  public static toExtractedRows(
    parsedData: ParsedFileData,
    targetYear?: number,
  ): ExtractedRow[] {
    const sheet = parsedData.primarySheet;
    if (!sheet) return [];

    const h = sheet.headers;

    const gpcRefIdx = this.col(h, [
      "gpc reference number",
      "gpc ref no",
      "gpc ref",
      "gpc reference",
    ]);
    const totalEmIdx = this.col(h, [
      "total emissions",
      "total emission units",
      "ghg emissions",
      "emissions",
      "total co2e",
      "co2e",
    ]);
    const notationIdx = this.col(h, ["notation key", "notation"]);
    const sectorIdx = this.col(h, [
      "crf - sector",
      "sector name",
      "sector",
      "crf sector",
    ]);
    const subsectorIdx = this.col(h, [
      "crf - sub-sector",
      "subsector name",
      "subsector",
      "sub-sector",
      "crf sub-sector",
      "category",
    ]);
    const actTypeIdx = this.col(h, ["activity type", "activity_type"]);
    const actValIdx = this.col(h, [
      "activity value",
      "activity_value",
      "activity amount",
      "activity data - amount",
    ]);
    const actUnitIdx = this.col(h, [
      "activity units",
      "activity unit",
      "activity_units",
      "activity data - unit",
    ]);
    const co2Idx = this.col(h, ["co2 emissions", "co2"]);
    const ch4Idx = this.col(h, ["ch4 emissions", "ch4"]);
    const n2oIdx = this.col(h, ["n2o emissions", "n2o"]);
    const scopeIdx = this.col(h, ["scope"]);
    const sourceIdx = this.col(h, [
      "data source name",
      "data source id",
      "data source",
    ]);
    const efUnitIdx = this.col(h, [
      "emission factor - unit",
      "emission factor unit",
    ]);
    const efCO2Idx = this.col(h, [
      "emission factor - co2",
      "emission factor co2",
    ]);
    const efCH4Idx = this.col(h, [
      "emission factor - ch4",
      "emission factor ch4",
    ]);
    const efN2OIdx = this.col(h, [
      "emission factor - n2o",
      "emission factor n2o",
    ]);

    const rows: ExtractedRow[] = [];

    for (const row of sheet.rows) {
      const get = (idx: number): unknown =>
        idx >= 0 ? row[h[idx]] ?? null : null;

      const notation = this.strVal(get(notationIdx));
      const totalCO2e = this.numVal(get(totalEmIdx));

      // Skip rows that have no emissions and no meaningful notation key
      if (totalCO2e === null && !notation) continue;

      let gpcRefNo = this.strVal(get(gpcRefIdx));
      const activityType = this.strVal(get(actTypeIdx));
      const { sector, subsector } = splitSectorSubsectorLabels(
        this.strVal(get(sectorIdx)) ?? "",
        this.strVal(get(subsectorIdx)) ?? "",
      );

      if (!gpcRefNo && sector && subsector) {
        gpcRefNo = resolveGpcRefNo(sector, subsector, activityType ?? undefined);
      }

      const resolvedSector =
        sector || (gpcRefNo ? this.sectorFromGpcRef(gpcRefNo) : null);

      rows.push({
        year: targetYear ?? null,
        sector: resolvedSector,
        subsector: subsector || null,
        scope: this.strVal(get(scopeIdx)),
        category: subsector || null,
        totalCO2e,
        co2: this.numVal(get(co2Idx)),
        ch4: this.numVal(get(ch4Idx)),
        n2o: this.numVal(get(n2oIdx)),
        gpcRefNo,
        source: this.strVal(get(sourceIdx)),
        activityAmount: this.numVal(get(actValIdx)),
        activityUnit: this.strVal(get(actUnitIdx)),
        activityType: this.strVal(get(actTypeIdx)),
        // Pass notation key and emission factor columns through as free-form fields.
        // These are stored in ExtractedRow via the existing extended fields.
        ...(notation ? { notationKey: notation } : {}),
        ...(efUnitIdx >= 0
          ? { emissionFactorUnit: this.strVal(get(efUnitIdx)) }
          : {}),
        ...(efCO2Idx >= 0
          ? { emissionFactorCO2: this.numVal(get(efCO2Idx)) }
          : {}),
        ...(efCH4Idx >= 0
          ? { emissionFactorCH4: this.numVal(get(efCH4Idx)) }
          : {}),
        ...(efN2OIdx >= 0
          ? { emissionFactorN2O: this.numVal(get(efN2OIdx)) }
          : {}),
      });
    }

    return rows;
  }

  // ── Private: detection helpers ─────────────────────────────────────────────

  /** Adapter D: has GPC ref + emissions + notation columns. */
  private static isNearECRF(headersLower: string[]): boolean {
    const hasGpcRef = headersLower.some((h) => /gpc.*(ref|reference)/i.test(h));
    const hasEmissions = headersLower.some((h) =>
      /total.*emission|total.*co2e|ghg.*emission/i.test(h),
    );
    const hasNotation = headersLower.some((h) => /notation/i.test(h));
    return hasGpcRef && hasEmissions && hasNotation;
  }

  /** Adapter B: 3+ headers contain a 4-digit calendar year. */
  private static detectWideYearColumn(
    headersLower: string[],
  ): string | undefined {
    const yearMatches = headersLower.filter((h) =>
      /\b(19|20)\d{2}\b/.test(h),
    );
    return yearMatches.length >= 3 ? yearMatches[0] : undefined;
  }

  /** Adapter A: dedicated Year + Sector + numeric Emissions columns. */
  private static detectLongTidy(
    sheet: ParsedSheet,
    headers: string[],
    headersLower: string[],
  ):
    | { yearCol: string; sectorCol: string; emissionsCol: string }
    | null {
    const yearIdx = this.col(headers, [
      "year",
      "calendar year",
      "fiscal year",
      "accounting year",
      "year (calendar year)",
      "year (fiscal year)",
    ]);
    const sectorIdx = this.col(headers, [
      "sector",
      "sectors sector",
      "category",
      "sectors",
      "department",
    ]);
    const emissionsIdx = this.col(headers, [
      "ghg emissions (mt co2e)",
      "ghg emissions",
      "ghg_emissions",
      "co2e",
      "tco2e",
      "emissions_mtco2e",
      "emissions (mt co2e)",
      "total emissions",
    ]);

    if (yearIdx < 0 || sectorIdx < 0 || emissionsIdx < 0) return null;

    // Verify year column actually contains integer year values
    const sampleYears = sheet.rows
      .slice(0, 20)
      .map((r) => r[headers[yearIdx]])
      .filter((v) => v != null);
    const hasYearInts = sampleYears.some((v) =>
      /^(19|20)\d{2}$/.test(String(v).trim()),
    );

    if (!hasYearInts) return null;

    return {
      yearCol: headers[yearIdx],
      sectorCol: headers[sectorIdx],
      emissionsCol: headers[emissionsIdx],
    };
  }

  /** Adapter C: XLSX workbook with scope or emission-category sheets. */
  private static isMultiSheetWorkbook(parsedData: ParsedFileData): boolean {
    const names = parsedData.sheets.map((s) => s.name.toLowerCase());
    const scopeSheets = names.filter((n) => /scope\s*[123]/i.test(n));
    const emissionSheets = names.filter((n) =>
      /emission|fuel.*consump|electricity.*consump|solid.waste|wastewater/i.test(
        n,
      ),
    );
    return scopeSheets.length >= 1 || emissionSheets.length >= 2;
  }

  /** Multi-city: has organization/city column with more than one distinct value in first 100 rows. */
  private static detectMultiCity(
    sheet: ParsedSheet,
    headers: string[],
  ): boolean {
    const cityColHeader = headers.find((h) =>
      /\b(organization|city|municipality)\b/i.test(h),
    );
    if (!cityColHeader) return false;
    const uniqueValues = new Set(
      sheet.rows
        .slice(0, 100)
        .map((r) => String(r[cityColHeader] ?? "").trim())
        .filter(Boolean),
    );
    return uniqueValues.size > 2;
  }

  // ── Private: normalization helpers ─────────────────────────────────────────

  /** Adapter A → filter to targetYear + rename columns to clean English names. */
  private static normalizeLongTidy(
    parsedData: ParsedFileData,
    targetYear?: number,
  ): ParsedFileData {
    const sheet = parsedData.primarySheet;
    if (!sheet) return parsedData;

    const h = sheet.headers;
    const yearIdx = this.col(h, [
      "year",
      "calendar year",
      "fiscal year",
      "accounting year",
      "year (calendar year)",
      "year (fiscal year)",
    ]);
    const sectorIdx = this.col(h, [
      "sector",
      "sectors sector",
      "category",
      "sectors",
      "department",
    ]);
    const subsectorIdx = this.col(h, [
      "subsector",
      "sub-sector",
      "category full",
      "source full",
      "category label",
    ]);
    const sourceIdx = this.col(h, [
      "source",
      "fuel type",
      "fuel",
      "commodity_info",
      "source label",
    ]);
    const emissionsIdx = this.col(h, [
      "ghg emissions (mt co2e)",
      "ghg emissions",
      "ghg_emissions",
      "co2e",
      "tco2e",
      "emissions_mtco2e",
      "total emissions",
      "emissions (mt co2e)",
    ]);
    const activityAmountIdx = this.col(h, [
      "consumption",
      "consumed",
      "activity amount",
      "activity_amount",
      "consumption amount",
      "activity data - amount",
    ]);
    const activityUnitIdx = this.col(h, [
      "consumption_units",
      "consumption units",
      "activity unit",
      "activity_unit",
      "source units",
      "activity data - unit",
    ]);
    const scopeIdx = this.col(h, ["scope"]);
    const inventoryIdx = this.col(h, ["inventory", "inventory type"]);
    const deptIdx = this.col(h, ["department", "department longname"]);

    let rows = sheet.rows;

    // Try filtering to target year; if nothing matches, keep all rows so the AI
    // can still do its own year filtering (better than sending nothing at all).
    if (targetYear != null && yearIdx >= 0) {
      const yearFiltered = rows.filter((row) => {
        const v = row[h[yearIdx]];
        return v != null && String(v).trim() === String(targetYear);
      });
      if (yearFiltered.length > 0) {
        rows = yearFiltered;
      }
      // else: keep all rows — year mismatch; let AI decide
    }

    // Remove rows with no emissions value (or sentinel "-")
    if (emissionsIdx >= 0) {
      const emFiltered = rows.filter((row) => {
        const v = row[h[emissionsIdx]];
        return v != null && v !== "" && v !== "-";
      });
      // Only apply this filter if it leaves some rows
      if (emFiltered.length > 0) rows = emFiltered;
    }

    const normalizedRows = rows.map((row) => {
      const get = (idx: number) => (idx >= 0 ? row[h[idx]] ?? null : null);
      return {
        year: get(yearIdx),
        sector: get(sectorIdx),
        subsector: get(subsectorIdx),
        activity_type: get(sourceIdx),
        total_co2e_tonnes: get(emissionsIdx),
        activity_amount: get(activityAmountIdx),
        activity_unit: get(activityUnitIdx),
        scope: get(scopeIdx),
        inventory_type: get(inventoryIdx),
        department: get(deptIdx),
      };
    });

    // Keep only columns that have at least one non-null value (use key lookup, not positional indexing)
    const normalizedHeaders = (
      [
        "year",
        "sector",
        "subsector",
        "activity_type",
        "total_co2e_tonnes",
        "activity_amount",
        "activity_unit",
        "scope",
        "inventory_type",
        "department",
      ] as const
    ).filter((key) =>
      normalizedRows.some(
        (r) => (r as Record<string, unknown>)[key] != null,
      ),
    ) as string[];

    const normalizedSheet: ParsedSheet = {
      name: "normalized",
      headers: normalizedHeaders,
      rows: normalizedRows,
      rowCount: normalizedRows.length,
      columnCount: normalizedHeaders.length,
    };

    return {
      sheets: [normalizedSheet],
      primarySheet: normalizedSheet,
      fileType: parsedData.fileType,
    };
  }

  /** Adapter B → unpivot year columns into rows, keeping one row per category × year. */
  private static normalizeWideYear(
    parsedData: ParsedFileData,
    targetYear?: number,
  ): ParsedFileData {
    const sheet = parsedData.primarySheet;
    if (!sheet) return parsedData;

    const h = sheet.headers;

    // Find all unique years present in headers
    const allYears = [
      ...new Set(
        h
          .map((header) => {
            const m = header.match(/\b((?:19|20)\d{2})\b/);
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((y): y is number => y != null),
      ),
    ].sort();

    // Try to narrow to targetYear; if that year isn't in the file, use all years
    // so the AI still receives data to work with.
    const candidateYears =
      targetYear != null ? allYears.filter((y) => y === targetYear) : allYears;
    const years = candidateYears.length > 0 ? candidateYears : allYears;

    // Category (non-year) columns — all static descriptor columns, no hard limit
    const categoryHeaders = h.filter(
      (header) => !/\b(19|20)\d{2}\b/.test(header),
    );

    // Identify semantic columns by alias so the AI receives well-named fields
    const activityTypeHeader =
      categoryHeaders.find((header) =>
        /source.?label|source.?name|fuel.?type|activity.?type|commodity/i.test(
          header,
        ),
      ) ?? null;
    const activityUnitHeader =
      categoryHeaders.find((header) =>
        /source.?unit|activity.?unit|consumption.?unit|unit/i.test(header),
      ) ?? null;

    // Remaining category columns (excluding the ones we'll rename)
    const otherCategoryHeaders = categoryHeaders.filter(
      (header) =>
        header !== activityTypeHeader && header !== activityUnitHeader,
    );

    const unpivotedRows: Record<string, unknown>[] = [];

    for (const year of years) {
      // Primary tCO2e column for this year (prefer 100yr GWP)
      const tco2eHeader =
        h.find(
          (header) =>
            header.includes(String(year)) &&
            /tco2e|co2e/i.test(header) &&
            /100.*yr|100.*gwp/i.test(header),
        ) ||
        h.find(
          (header) =>
            header.includes(String(year)) && /tco2e|co2e/i.test(header),
        );

      if (!tco2eHeader) continue;

      const consumedHeader = h.find(
        (header) =>
          header.includes(String(year)) && /consumed|consumption/i.test(header),
      );

      for (const row of sheet.rows) {
        const totalCO2e = row[tco2eHeader];
        if (
          totalCO2e == null ||
          totalCO2e === "" ||
          totalCO2e === 0 ||
          totalCO2e === "0"
        )
          continue;

        const newRow: Record<string, unknown> = { year };
        for (const catHeader of otherCategoryHeaders) {
          newRow[catHeader] = row[catHeader];
        }
        if (activityTypeHeader)
          newRow["activity_type"] = row[activityTypeHeader];
        if (activityUnitHeader)
          newRow["activity_unit"] = row[activityUnitHeader];
        newRow["total_co2e_tonnes"] = totalCO2e;
        if (consumedHeader) newRow["activity_amount"] = row[consumedHeader];

        unpivotedRows.push(newRow);
      }
    }

    if (unpivotedRows.length === 0) return parsedData;

    const normalizedHeaders = [
      "year",
      ...otherCategoryHeaders,
      ...(activityTypeHeader ? ["activity_type"] : []),
      ...(activityUnitHeader ? ["activity_unit"] : []),
      "total_co2e_tonnes",
      "activity_amount",
    ].filter((hdr, i, arr) => arr.indexOf(hdr) === i);

    const normalizedSheet: ParsedSheet = {
      name: "normalized_wide",
      headers: normalizedHeaders,
      rows: unpivotedRows,
      rowCount: unpivotedRows.length,
      columnCount: normalizedHeaders.length,
    };

    return {
      sheets: [normalizedSheet],
      primarySheet: normalizedSheet,
      fileType: parsedData.fileType,
    };
  }

  /** Adapter C → merge Scope/fuel sheets into a single flat sheet. */
  private static normalizeMultiSheet(parsedData: ParsedFileData): ParsedFileData {
    // Prefer Scope 1/2/3 sheets; fall back to fuel/emission sheets
    const scopeSheets = parsedData.sheets.filter((s) =>
      /scope\s*[123]/i.test(s.name),
    );
    const emissionSheets = parsedData.sheets.filter((s) =>
      /emission|fuel.*consump|electricity.*consump|solid.waste|wastewater/i.test(
        s.name,
      ),
    );

    const targetSheets =
      scopeSheets.length > 0
        ? scopeSheets
        : emissionSheets.slice(0, 4);

    if (targetSheets.length === 0) return parsedData;

    // Only keep sheets that actually have usable data rows
    const usableSheets = targetSheets.filter(
      (s) => s.rows.length > 0 && s.headers.length > 1,
    );
    if (usableSheets.length === 0) return parsedData;

    // Build merged rows adding a source_sheet column
    const allHeaderSet = new Set<string>(["source_sheet"]);
    for (const s of usableSheets) {
      s.headers.forEach((header) => {
        if (header && !header.startsWith("Unnamed")) allHeaderSet.add(header);
      });
    }
    const allHeaders = [...allHeaderSet];

    const mergedRows: Record<string, unknown>[] = [];
    for (const s of usableSheets) {
      for (const row of s.rows) {
        // Skip rows that look like sub-headers (all string, no numbers)
        const hasNumeric = Object.values(row).some(
          (v) => v != null && typeof v === "number",
        );
        if (!hasNumeric) continue;
        mergedRows.push({ ...row, source_sheet: s.name });
      }
    }

    if (mergedRows.length === 0) return parsedData;

    const normalizedSheet: ParsedSheet = {
      name: "merged_scopes",
      headers: allHeaders,
      rows: mergedRows,
      rowCount: mergedRows.length,
      columnCount: allHeaders.length,
    };

    return {
      sheets: [normalizedSheet],
      primarySheet: normalizedSheet,
      fileType: parsedData.fileType,
    };
  }

  // ── Public: header fingerprinting ─────────────────────────────────────────

  /**
   * Derive a stable, human-readable lookup key from a file's column headers.
   * Each header is lowercased, trimmed, and stripped of leading/trailing
   * punctuation before being sorted and pipe-joined.
   *
   * e.g. ["Year (Calendar Year)", "GHG Emissions", "Sector"] → "ghg_emissions|sector|year_calendar_year"
   *
   * The key is used as the unique identifier in ImportMappingFeedback
   * (together with cityId) so that past approved mappings can be retrieved
   * and injected into future AI prompts for files with the same shape.
   */
  public static headerKey(headers: string[]): string {
    return headers
      .map((h) =>
        h
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, ""),
      )
      .filter(Boolean)
      .sort()
      .join("|");
  }

  // ── Private: shared utilities ──────────────────────────────────────────────

  /** Find column index using FileParserService's fuzzy matching. */
  private static col(headers: string[], terms: string[]): number {
    return FileParserService.detectColumn(headers, terms);
  }

  /** Parse numeric value, handling locale commas and sentinel dashes. */
  private static numVal(v: unknown): number | null {
    if (v == null || v === "" || v === "-") return null;
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }

  /** Parse string value, returning null for empty/whitespace. */
  private static strVal(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" || s === "-" ? null : s;
  }

  /** Derive GPC sector display name from a GPC reference number prefix (I, II, III…). */
  private static sectorFromGpcRef(ref: string): string | null {
    const prefix = ref.split(".")[0]?.toUpperCase().trim();
    return GPC_SECTOR_BY_PREFIX[prefix] ?? null;
  }
}
