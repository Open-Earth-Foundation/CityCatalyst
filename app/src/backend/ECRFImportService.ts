import { db } from "@/models";
import {
  resolveGpcRefFromLabels,
  scopeFromLabel,
  splitSectorSubsectorLabels,
} from "@/util/GHGI/gpc-ref-resolver";
import {
  hasSignedNumericValue,
  parseNumericCell,
} from "@/util/parse-numeric-cell";
import { inferInventoryYearFromSheets } from "@/util/infer-inventory-year";
import { toCanonical } from "@/util/notation-keys";
import { type ParsedFileData } from "./FileParserService";
import type { ExtractedRow } from "./InventoryExtractionService";
import type { ImportRowIssue } from "@/util/types";
import type { ActivityClass } from "@/util/GHGI/activity-class-rules";
import { excelRowNumber } from "@/util/excel-row-number";

/**
 * When activity_name holds a notation-key label (e.g. "Not Occuring") and
 * there is no dedicated notation column, treat it as the notation key and
 * clear the activity type so it is not stored as a fuel.
 */
function resolveNotationFromActivity(args: {
  notationKey?: string;
  activityType?: string;
}): { notationKey?: string; activityType?: string } {
  if (args.notationKey) {
    return { notationKey: args.notationKey, activityType: args.activityType };
  }
  if (args.activityType && toCanonical(args.activityType)) {
    return { notationKey: args.activityType, activityType: undefined };
  }
  return { notationKey: undefined, activityType: args.activityType };
}

function isBlankParsedRow(
  row: Record<string, string | number | null>,
): boolean {
  return !Object.values(row).some(
    (value) => value != null && String(value).trim() !== "",
  );
}

export interface ECRFRowData {
  gpcRefNo: string;
  sectorId: string;
  subsectorId: string;
  subcategoryId: string | null; // null for sectors IV-V (IPPU and AFOLU)
  scopeId: string;
  co2?: number;
  ch4?: number;
  n2o?: number;
  totalCO2e?: number;
  notationKey?: string;
  // Activity data fields
  activityType?: string;
  activityAmount?: number;
  activityUnit?: string;
  methodology?: string;
  activityDataSource?: string;
  activityDataQuality?: string;
  emissionFactorSource?: string;
  emissionFactorDescription?: string;
  emissionFactorUnit?: string;
  emissionFactorCO2?: number;
  emissionFactorCH4?: number;
  emissionFactorN2O?: number;
  emissionFactorTotalCO2e?: number;
  year?: number;
  rowIndex: number;
  /** 1-based row number in the uploaded file, when known. */
  sourceRowNumber?: number;
  /** Sector / subsector text for rows whose GPC reference could not be resolved. */
  sourceLabel?: string;
  /** Why the row is rejected; set together with `errors`. */
  issue?: ImportRowIssue;
  errors?: string[];
  warnings?: string[];
  /** What the import review needs; extracted rows only. */
  review?: ECRFRowReviewData;
}

export interface ECRFRowReviewData {
  sector: string | null;
  subsector: string | null;
  category: string | null;
  activityType?: string | null;
  scope: string | null;
  refSource: "document" | "inferred" | null;
  directionEvidence: string | null;
  directionEvidenceFound: boolean | null;
  page: number | null;
  source: string | null;
  decision: "keep" | "reclassify" | "correct-scope" | "skip" | null;
  finalScope?: string | null;
  decisionToken?: string;
  catalogueScope?: number | null;
  finalCatalogueScope?: number | null;
  suggestedRefNo: string | null;
  /** Present only on PDF rows extracted after activity classes existed. */
  activityClass?: ActivityClass | null;
  scopeSource?: "document" | "inferred" | null;
  originalScope?: string | null;
}

export interface ECRFImportResult {
  rows: ECRFRowData[];
  /** PDF rows come from a model, so held rows need a user decision. */
  requiresReferenceReview?: boolean;
  errors: string[];
  warnings: string[];
  rowCount: number;
  validRowCount: number;
  /**
   * Rows kept in the parse but dropped at import: no signed CO2, CH4, N2O,
   * or total CO2e, and no notation key. Zero counts as empty.
   */
  rowsSkippedEmptyEmissions: number;
  /** First non-null year from file when a year column is mapped (inventory year). */
  inferredYearFromFile?: number;
}

/** Same rule InventoryImportService uses when it skips a row at commit. */
export function countRowsSkippedEmptyEmissions(rows: ECRFRowData[]): number {
  return rows.filter(
    (row) =>
      !hasSignedNumericValue(row.co2) &&
      !hasSignedNumericValue(row.ch4) &&
      !hasSignedNumericValue(row.n2o) &&
      !hasSignedNumericValue(row.totalCO2e) &&
      !row.notationKey,
  ).length;
}

/**
 * eCRF Import Service
 * Processes eCRF files and extracts data for inventory import
 */
export default class ECRFImportService {
  /**
   * Process parsed eCRF file and extract structured data
   * @param parsedData - Parsed file data from FileParserService
   * @param detectedColumns - Column mappings from validation
   * @returns ECRFImportResult with processed rows
   */
  public static async processECRFFile(
    parsedData: ParsedFileData,
    detectedColumns: Record<string, number>,
  ): Promise<ECRFImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rows: ECRFRowData[] = [];

    if (!parsedData.primarySheet) {
      return {
        rows: [],
        errors: ["No data sheet found in file"],
        warnings: [],
        rowCount: 0,
        validRowCount: 0,
        rowsSkippedEmptyEmissions: 0,
      };
    }

    const sheet = parsedData.primarySheet;
    const headers = sheet.headers;
    const hasGpcRefNoColumn = detectedColumns.gpcRefNo !== undefined;
    const hasSectorColumn = detectedColumns.sector !== undefined;
    const hasSubsectorColumn = detectedColumns.subsector !== undefined;
    const scopeHeader =
      detectedColumns.scope !== undefined
        ? headers[detectedColumns.scope]
        : this.findHeader(headers, ["scope"]);

    if (!hasGpcRefNoColumn && (!hasSectorColumn || !hasSubsectorColumn)) {
      errors.push(
        "When GPC ref. no. column is missing, both Sector and Sub-sector columns are required",
      );
      return {
        rows: [],
        errors,
        warnings,
        rowCount: sheet.rows.length,
        validRowCount: 0,
        rowsSkippedEmptyEmissions: 0,
      };
    }

    const catalogueScopes = new Map(
      (
        await db.models.Scope.findAll({ attributes: ["scopeId", "scopeName"] })
      ).map((scope) => [scope.scopeId, scopeFromLabel(scope.scopeName)]),
    );

    let rowsSkippedEmptyEmissions = 0;

    // Process each row
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const sourceRowNumber = excelRowNumber(i, sheet.rowNumbers?.[i]);
      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];

      // CIRIS templates leave thousands of blank / structural-only rows — skip quietly.
      if (isBlankParsedRow(row)) {
        rowsSkippedEmptyEmissions += 1;
        continue;
      }

      let gpcRefNo: string | undefined = hasGpcRefNoColumn
        ? row[headers[detectedColumns.gpcRefNo!]]?.toString().trim()
        : undefined;
      if (gpcRefNo === "") gpcRefNo = undefined;
      const statedReference = gpcRefNo;
      const statedScope = scopeHeader
        ? row[scopeHeader]?.toString()
        : undefined;

      if (!gpcRefNo && (hasSectorColumn || hasSubsectorColumn)) {
        const rawSector = hasSectorColumn
          ? row[headers[detectedColumns.sector!]]?.toString().trim()
          : "";
        const rawSubsector = hasSubsectorColumn
          ? row[headers[detectedColumns.subsector!]]?.toString().trim()
          : "";
        const activityHeader =
          detectedColumns.activityType !== undefined
            ? headers[detectedColumns.activityType]
            : this.findHeader(headers, [
                "fuel type or activity",
                "activity_name",
                "activity name",
                "activity type",
                "activity_type",
                "fuel type",
                "fuel_type",
                "fuel",
              ]);
        const activityType = activityHeader
          ? row[activityHeader]?.toString().trim()
          : undefined;
        const scopeLabel = scopeHeader
          ? row[scopeHeader]?.toString().trim()
          : undefined;
        const resolved = resolveGpcRefFromLabels({
          sector: rawSector,
          subsector: rawSubsector,
          fuelTypeOrActivity: activityType,
          scopeLabel,
        });
        if (resolved) {
          gpcRefNo = resolved;
        } else if (rawSector || rawSubsector) {
          rowErrors.push(
            `Could not resolve GPC ref from sector "${rawSector}" and subsector "${rawSubsector}"`,
          );
          rows.push({
            gpcRefNo: "",
            sectorId: "",
            subsectorId: "",
            subcategoryId: null,
            scopeId: "",
            rowIndex: i,
            sourceRowNumber,
            sourceLabel: `${rawSector} / ${rawSubsector}`,
            issue: "gpc-reference-unresolved",
            errors: rowErrors,
            warnings: rowWarnings,
          });
          continue;
        }
      }

      if (!gpcRefNo) {
        // Keep the row (as rejected) so the mapping step can show why it is skipped.
        rows.push({
          gpcRefNo: "",
          sectorId: "",
          subsectorId: "",
          subcategoryId: null,
          scopeId: "",
          rowIndex: i,
          sourceRowNumber,
          issue: "missing-gpc-reference",
          errors: ["No GPC reference number found"],
        });
        continue;
      }

      // Skip empty CIRIS/eCRF template rows before taxonomy lookups.
      // Treat activity_name notation labels (e.g. "Not Occuring") as real content.
      const earlyNotationHeader =
        detectedColumns.notationKey !== undefined
          ? headers[detectedColumns.notationKey]
          : this.findHeader(headers, [
              "notation key",
              "notation_key",
              "notation",
            ]);
      const earlyNotation = earlyNotationHeader
        ? row[earlyNotationHeader]?.toString().trim()
        : undefined;
      const earlyActivityHeader =
        detectedColumns.activityType !== undefined
          ? headers[detectedColumns.activityType]
          : this.findHeader(headers, [
              "activity_name",
              "activity name",
              "activity type",
              "activity_type",
              "fuel type",
              "fuel_type",
              "fuel",
            ]);
      const earlyActivity = earlyActivityHeader
        ? row[earlyActivityHeader]?.toString().trim()
        : undefined;
      const earlyNotationResolved = resolveNotationFromActivity({
        notationKey: earlyNotation || undefined,
        activityType: earlyActivity || undefined,
      }).notationKey;
      const earlyHasEmissions =
        hasSignedNumericValue(
          this.extractGasValue(row, headers, detectedColumns.co2),
        ) ||
        hasSignedNumericValue(
          this.extractGasValue(row, headers, detectedColumns.ch4),
        ) ||
        hasSignedNumericValue(
          this.extractGasValue(row, headers, detectedColumns.n2o),
        ) ||
        hasSignedNumericValue(
          this.extractGasValue(row, headers, detectedColumns.totalCO2e),
        );
      if (!earlyHasEmissions && !earlyNotationResolved) {
        rowsSkippedEmptyEmissions += 1;
        continue;
      }

      // Look up GPC reference number in database
      const gpcMapping = await this.lookupGPCReference(gpcRefNo);
      if (!gpcMapping) {
        rowErrors.push(
          `GPC reference number "${gpcRefNo}" not found in taxonomy`,
        );
        rows.push({
          gpcRefNo,
          sectorId: "",
          subsectorId: "",
          subcategoryId: null,
          scopeId: "",
          rowIndex: i,
          sourceRowNumber,
          issue: "gpc-reference-unknown",
          errors: rowErrors,
          warnings: rowWarnings,
        });
        continue;
      }

      // Extract gas values
      const co2 = this.extractGasValue(row, headers, detectedColumns.co2);
      const ch4 = this.extractGasValue(row, headers, detectedColumns.ch4);
      const n2o = this.extractGasValue(row, headers, detectedColumns.n2o);
      // Try to find the correct total CO2e column if the detected one is wrong
      let totalCO2eColumnIndex: number | undefined = detectedColumns.totalCO2e;
      let totalCO2eHeader: string | undefined =
        totalCO2eColumnIndex !== undefined
          ? headers[totalCO2eColumnIndex]
          : undefined;

      // If the detected column is "Emission factor - Total CO2e", try to find the correct one
      if (
        totalCO2eHeader &&
        totalCO2eHeader.toLowerCase().includes("emission factor") &&
        !totalCO2eHeader.toLowerCase().includes("ghgs")
      ) {
        console.log(
          `[ECRFImport] GPC ${gpcRefNo} - Wrong column detected: "${totalCO2eHeader}", searching for correct column...`,
        );
        // Search for the correct column manually
        const correctHeaderIndex = headers.findIndex(
          (h) =>
            h.toLowerCase().includes("ghgs") &&
            h.toLowerCase().includes("metric tonnes") &&
            h.toLowerCase().includes("total co2e"),
        );
        if (correctHeaderIndex !== -1) {
          totalCO2eColumnIndex = correctHeaderIndex;
          totalCO2eHeader = headers[correctHeaderIndex];
          console.log(
            `[ECRFImport] GPC ${gpcRefNo} - Found correct column: "${totalCO2eHeader}" at index ${correctHeaderIndex}`,
          );
        }
      }

      const totalCO2e =
        totalCO2eColumnIndex !== undefined
          ? this.extractGasValue(row, headers, totalCO2eColumnIndex)
          : undefined;

      // Debug: Log totalCO2e extraction
      if (totalCO2eColumnIndex !== undefined && totalCO2eHeader) {
        console.log(
          `[ECRFImport] GPC ${gpcRefNo} - Total CO2e column: "${totalCO2eHeader}", index: ${totalCO2eColumnIndex}, raw value: ${row[totalCO2eHeader]}, extracted: ${totalCO2e}`,
        );
      } else {
        console.log(
          `[ECRFImport] GPC ${gpcRefNo} - Total CO2e column NOT DETECTED`,
        );
      }

      // Extract notation key if present
      const notationKeyHeader =
        detectedColumns.notationKey !== undefined
          ? headers[detectedColumns.notationKey]
          : this.findHeader(headers, [
              "notation key",
              "notation_key",
              "notation",
            ]);
      const notationKeyFromColumn = notationKeyHeader
        ? row[notationKeyHeader]?.toString().trim()
        : undefined;

      // Extract year (inventory year) if present
      const yearHeader =
        detectedColumns.year !== undefined
          ? headers[detectedColumns.year]
          : this.findHeader(headers, [
              "year",
              "inventory year",
              "reporting year",
              "reference year",
            ]);
      let year: number | undefined;
      if (yearHeader) {
        const raw = row[yearHeader];
        if (raw != null && raw !== "") {
          const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
          if (!isNaN(n) && n >= 1900 && n <= 2100) {
            year = n;
          }
        }
      }

      // Prefer the validator / mapping override index so activity_name is kept
      const activityTypeHeader =
        detectedColumns.activityType !== undefined
          ? headers[detectedColumns.activityType]
          : this.findHeader(headers, [
              "activity_name",
              "activity name",
              "activity type",
              "activity_type",
              "fuel type",
              "fuel_type",
              "fuel",
            ]);
      const activityTypeRaw = activityTypeHeader
        ? row[activityTypeHeader]?.toString().trim()
        : undefined;

      const { notationKey, activityType } = resolveNotationFromActivity({
        notationKey: notationKeyFromColumn || undefined,
        activityType: activityTypeRaw || undefined,
      });

      // Get activity amount header name (using detectedColumns index or findHeader)
      const activityAmountHeader =
        detectedColumns.activityAmount !== undefined
          ? headers[detectedColumns.activityAmount]
          : this.findHeader(headers, [
              "activity data - amount",
              "activity_data - amount",
              "activity data-amount",
              "activity_data-amount",
              "activity amount",
              "activity_amount",
              "activity value",
              "activity_value",
            ]);
      // Extract activity amount (signed: AFOLU removals can be negative)
      let activityAmount: number | undefined = undefined;
      if (activityAmountHeader) {
        activityAmount = parseNumericCell(row[activityAmountHeader]);
      }

      // Get activity unit header (using detectedColumns index or findHeader)
      const activityUnitHeader =
        detectedColumns.activityUnit !== undefined
          ? headers[detectedColumns.activityUnit]
          : this.findHeader(headers, [
              "activity data - unit",
              "activity_data - unit",
              "activity data-unit",
              "activity_data-unit",
              "activity unit",
              "activity_unit",
              "activity units",
              "activity_units",
            ]);
      const activityUnit = activityUnitHeader
        ? row[activityUnitHeader]?.toString().trim()
        : undefined;

      const methodologyHeader = this.findHeader(headers, [
        "activity data - description and methodology",
        "activity data - description",
        "activity data description",
        "methodology",
        "input methodology",
        "input_methodology",
      ]);
      const methodology = methodologyHeader
        ? row[methodologyHeader]?.toString().trim()
        : undefined;

      // Get activity data source header (using detectedColumns index or findHeader)
      const activityDataSourceHeader =
        detectedColumns.activityDataSource !== undefined
          ? headers[detectedColumns.activityDataSource]
          : this.findHeader(headers, [
              "activity data - source",
              "activity_data - source",
              "activity data-source",
              "activity_data-source",
              "activity data source",
              "activity_data_source",
              "data source",
              "data_source",
            ]);
      const activityDataSource = activityDataSourceHeader
        ? row[activityDataSourceHeader]?.toString().trim()
        : undefined;

      const activityDataQualityHeader = this.findHeader(headers, [
        "activity data quality",
        "activity_data_quality",
        "data quality",
        "data_quality",
      ]);
      const activityDataQuality = activityDataQualityHeader
        ? row[activityDataQualityHeader]?.toString().trim()
        : undefined;

      const emissionFactorSourceHeader =
        detectedColumns.emissionFactorSource !== undefined
          ? headers[detectedColumns.emissionFactorSource]
          : this.findHeader(headers, [
              "emission factor source",
              "emission_factor_source",
              "ef source",
              "ef_source",
            ]);
      const emissionFactorSource = emissionFactorSourceHeader
        ? row[emissionFactorSourceHeader]?.toString().trim()
        : undefined;

      const emissionFactorDescriptionHeader =
        detectedColumns.emissionFactorDescription !== undefined
          ? headers[detectedColumns.emissionFactorDescription]
          : this.findHeader(headers, [
              "emission factor description",
              "emission_factor_description",
              "ef description",
              "ef_description",
            ]);
      const emissionFactorDescription = emissionFactorDescriptionHeader
        ? row[emissionFactorDescriptionHeader]?.toString().trim()
        : undefined;

      const emissionFactorUnitHeader =
        detectedColumns.emissionFactorUnit !== undefined
          ? headers[detectedColumns.emissionFactorUnit]
          : this.findHeader(headers, [
              "emission factor - unit",
              "emission factor unit",
              "ef unit",
              "ef_unit",
            ]);
      const emissionFactorUnit = emissionFactorUnitHeader
        ? row[emissionFactorUnitHeader]?.toString().trim()
        : undefined;

      // Only read EF columns when the header itself looks like an EF column.
      // detectedColumns can still carry a bad index from older validations.
      const emissionFactorCO2 = this.extractEmissionFactorValue(
        row,
        headers,
        detectedColumns.emissionFactorCO2,
        ["emission factor - co2", "emission factor co2", "ef co2", "ef_co2"],
      );
      const emissionFactorCH4 = this.extractEmissionFactorValue(
        row,
        headers,
        detectedColumns.emissionFactorCH4,
        ["emission factor - ch4", "emission factor ch4", "ef ch4", "ef_ch4"],
      );
      const emissionFactorN2O = this.extractEmissionFactorValue(
        row,
        headers,
        detectedColumns.emissionFactorN2O,
        ["emission factor - n2o", "emission factor n2o", "ef n2o", "ef_n2o"],
      );
      const emissionFactorTotalCO2e = this.extractEmissionFactorValue(
        row,
        headers,
        detectedColumns.emissionFactorTotalCO2e,
        [
          "emission factor - total co2e",
          "emission factor total co2e",
          "ef total co2e",
          "ef_total co2e",
        ],
      );

      // Empty emissions and no notation: silent skip (CIRIS template filler rows).
      const hasEmissions =
        hasSignedNumericValue(co2) ||
        hasSignedNumericValue(ch4) ||
        hasSignedNumericValue(n2o) ||
        hasSignedNumericValue(totalCO2e);
      if (!hasEmissions && !notationKey) {
        rowsSkippedEmptyEmissions += 1;
        continue;
      }

      // Value + notation on the same row: keep values, warn (do not invent Path B behaviour).
      if (hasEmissions && notationKey) {
        rowWarnings.push(
          "Row has both emission values and a notation key; values were kept",
        );
        warnings.push(
          `Row ${sourceRowNumber}: Has both emission values and a notation key; values were kept`,
        );
      }

      rows.push({
        gpcRefNo,
        sectorId: gpcMapping.sectorId,
        subsectorId: gpcMapping.subsectorId,
        subcategoryId: gpcMapping.subcategoryId,
        scopeId: gpcMapping.scopeId,
        review: {
          sector: hasSectorColumn
            ? (row[headers[detectedColumns.sector!]]?.toString() ?? null)
            : null,
          subsector: hasSubsectorColumn
            ? (row[headers[detectedColumns.subsector!]]?.toString() ?? null)
            : null,
          category: activityType ?? null,
          scope: statedScope || null,
          catalogueScope: catalogueScopes.has(gpcMapping.scopeId)
            ? (catalogueScopes.get(gpcMapping.scopeId) ?? null)
            : undefined,
          finalCatalogueScope: catalogueScopes.has(gpcMapping.scopeId)
            ? (catalogueScopes.get(gpcMapping.scopeId) ?? null)
            : undefined,
          refSource: statedReference
            ? ("document" as const)
            : ("inferred" as const),
          directionEvidence: null,
          directionEvidenceFound: null,
          page: null,
          source: null,
          decision: null,
          suggestedRefNo: statedReference ?? gpcRefNo,
        },
        co2,
        ch4,
        n2o,
        totalCO2e: totalCO2e,
        notationKey,
        year,
        activityType,
        activityAmount,
        activityUnit,
        methodology,
        activityDataSource,
        activityDataQuality,
        emissionFactorSource,
        emissionFactorDescription,
        emissionFactorUnit,
        emissionFactorCO2,
        emissionFactorCH4,
        emissionFactorN2O,
        emissionFactorTotalCO2e,
        rowIndex: i,
        sourceRowNumber,
        errors: rowErrors.length > 0 ? rowErrors : undefined,
        warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
      });
    }

    const validRows = rows.filter((r) => !r.errors || r.errors.length === 0);
    if (validRows.length === 0) {
      errors.push("No valid rows found in file");
    }

    // Review banner reads these stored "Row N:" strings (same shape as Adapter D).
    for (const row of rows) {
      const n = excelRowNumber(row.rowIndex, row.sourceRowNumber);
      if (row.errors?.length) {
        warnings.push(`Row ${n}: ${row.errors[0]}`);
      }
    }

    const inferredYearFromFile =
      rows.find((r) => r.year != null)?.year ??
      inferInventoryYearFromSheets(parsedData.sheets);

    return {
      rows,
      requiresReferenceReview: true,
      errors,
      warnings,
      rowCount: rows.length + rowsSkippedEmptyEmissions,
      validRowCount: validRows.length,
      rowsSkippedEmptyEmissions,
      inferredYearFromFile,
    };
  }

  /**
   * Look up GPC reference number in database
   * For sectors I-III: looks up SubCategory by referenceNumber
   * For sectors IV-V (IPPU and AFOLU): looks up SubSector by referenceNumber (no subcategories)
   */
  public static async lookupGPCReference(gpcRefNo: string): Promise<{
    sectorId: string;
    subsectorId: string;
    subcategoryId: string | null;
    scopeId: string;
  } | null> {
    // First try to find SubCategory (for sectors I-III)
    const subcategory = await db.models.SubCategory.findOne({
      where: {
        referenceNumber: gpcRefNo,
      },
      include: [
        {
          model: db.models.SubSector,
          as: "subsector",
          include: [
            {
              model: db.models.Sector,
              as: "sector",
            },
          ],
        },
      ],
    });

    if (subcategory) {
      const subsector = subcategory.subsector;
      if (!subsector) {
        return null;
      }

      const sector = subsector.sector;
      if (!sector) {
        return null;
      }

      // Scope can be on SubCategory or SubSector
      const scopeId = subcategory.scopeId || subsector.scopeId;
      if (!scopeId) {
        return null;
      }

      return {
        sectorId: sector.sectorId,
        subsectorId: subsector.subsectorId,
        subcategoryId: subcategory.subcategoryId,
        scopeId,
      };
    }

    // If no SubCategory found, try SubSector (for sectors IV-V: IPPU and AFOLU)
    const subsector = await db.models.SubSector.findOne({
      where: {
        referenceNumber: gpcRefNo,
      },
      include: [
        {
          model: db.models.Sector,
          as: "sector",
        },
      ],
    });

    if (!subsector) {
      return null;
    }

    const sector = subsector.sector;
    if (!sector) {
      return null;
    }

    // Scope is on SubSector for sectors IV-V
    const scopeId = subsector.scopeId;
    if (!scopeId) {
      return null;
    }

    return {
      sectorId: sector.sectorId,
      subsectorId: subsector.subsectorId,
      subcategoryId: null, // Sectors IV-V don't have subcategories
      scopeId,
    };
  }

  /**
   * Convert Adapter D / PDF extracted rows into the same shape processECRFFile
   * produces so InventoryImportService.importECRFData can persist them.
   * Shared by the approve route path and the bulk import worker.
   */
  public static async fromExtractedRows(
    extractedRows: ExtractedRow[],
  ): Promise<ECRFImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rows: ECRFRowData[] = [];
    let inferredYear: number | undefined;

    const scopeByName = new Map<string, string>();
    const scopeById = new Map<string, number | undefined>();
    const scopeRecords = await db.models.Scope.findAll({
      attributes: ["scopeId", "scopeName"],
    });
    for (const scope of scopeRecords) {
      if (scope.scopeName) scopeByName.set(scope.scopeName, scope.scopeId);
      scopeById.set(scope.scopeId, scopeFromLabel(scope.scopeName));
    }

    for (let i = 0; i < extractedRows.length; i++) {
      const row = extractedRows[i];
      const sourceRowNumber = excelRowNumber(i, row.sourceRowNumber);
      const isEmpty =
        !hasSignedNumericValue(row.totalCO2e) &&
        !hasSignedNumericValue(row.co2) &&
        !hasSignedNumericValue(row.ch4) &&
        !hasSignedNumericValue(row.n2o) &&
        !row.notationKey;
      if (isEmpty) {
        rows.push({
          gpcRefNo: row.gpcRefNo?.trim() ?? "",
          sectorId: "",
          subsectorId: "",
          subcategoryId: null,
          scopeId: "",
          rowIndex: i,
          sourceRowNumber,
          sourceLabel:
            [row.sector, row.subsector].filter(Boolean).join(" / ") ||
            undefined,
          issue: "no-value-or-notation-key",
          errors: ["No gas values or notation key found"],
        });
        warnings.push(
          `Row ${sourceRowNumber}: Skipped - no emission values or notation key`,
        );
        continue;
      }
      const { sector, subsector } = splitSectorSubsectorLabels(
        row.sector?.trim() ?? "",
        row.subsector?.trim() ?? "",
      );
      const activityHint =
        row.activityType?.trim() || row.category?.trim() || undefined;
      const gpcRefNo =
        row.gpcRefNo?.trim() ||
        resolveGpcRefFromLabels({
          sector: row.sector,
          subsector: row.subsector,
          fuelTypeOrActivity: activityHint,
          scopeLabel: row.scope,
        }) ||
        null;

      if (!gpcRefNo) {
        errors.push(
          `Row ${sourceRowNumber}: Could not resolve GPC ref from sector "${sector}" and subsector "${subsector}"`,
        );
        rows.push({
          gpcRefNo: "",
          sectorId: "",
          subsectorId: "",
          subcategoryId: null,
          scopeId: "",
          rowIndex: i,
          sourceRowNumber,
          sourceLabel:
            [sector, subsector].filter(Boolean).join(" / ") || undefined,
          issue: "gpc-reference-unresolved",
          errors: [
            `Could not resolve GPC ref from sector "${sector}" and subsector "${subsector}"`,
          ],
        });
        continue;
      }

      const gpcMapping = await this.lookupGPCReference(gpcRefNo);
      if (!gpcMapping) {
        errors.push(
          `Row ${sourceRowNumber}: GPC reference "${gpcRefNo}" not in taxonomy`,
        );
        rows.push({
          gpcRefNo,
          sectorId: "",
          subsectorId: "",
          subcategoryId: null,
          scopeId: "",
          rowIndex: i,
          sourceRowNumber,
          issue: "gpc-reference-unknown",
          errors: [`GPC reference "${gpcRefNo}" not found in taxonomy`],
        });
        continue;
      }

      const scopeFromFile = row.scope?.trim();
      const resolvedScopeId =
        scopeFromFile && scopeByName.has(scopeFromFile)
          ? scopeByName.get(scopeFromFile)!
          : gpcMapping.scopeId;

      const num = (v: number | null | undefined): number | undefined =>
        v != null && Number.isFinite(v) ? Number(v) : undefined;
      if (row.year != null && Number.isFinite(row.year)) {
        inferredYear = inferredYear ?? (row.year as number);
      }

      const skippedInReview = row.reviewDecision === "skip";
      rows.push({
        gpcRefNo,
        sectorId: gpcMapping.sectorId,
        subsectorId: gpcMapping.subsectorId,
        subcategoryId: gpcMapping.subcategoryId,
        scopeId: resolvedScopeId,
        ...(skippedInReview
          ? {
              issue: "skipped-in-review" as const,
              errors: ["Skipped in the import review"],
            }
          : {}),
        review: {
          sector: row.sector ?? null,
          subsector: row.subsector ?? null,
          category: row.category ?? null,
          activityType: row.activityType ?? null,
          scope:
            row.scopeSource === "inferred"
              ? (row.scope ?? null)
              : (row.originalScope ?? row.scope ?? null),
          finalScope: scopeById.has(resolvedScopeId)
            ? String(scopeById.get(resolvedScopeId))
            : null,
          catalogueScope: scopeById.has(gpcMapping.scopeId)
            ? (scopeById.get(gpcMapping.scopeId) ?? null)
            : undefined,
          finalCatalogueScope: scopeById.has(gpcMapping.scopeId)
            ? (scopeById.get(gpcMapping.scopeId) ?? null)
            : undefined,
          refSource: row.refSource ?? null,
          directionEvidence: row.directionEvidence ?? null,
          directionEvidenceFound: row.directionEvidenceFound ?? null,
          page: row.page ?? null,
          source: row.source ?? null,
          decision: row.reviewDecision ?? null,
          suggestedRefNo: row.suggestedRefNo ?? null,
          ...("activityClass" in row
            ? { activityClass: row.activityClass ?? null }
            : {}),
          scopeSource: row.scopeSource ?? null,
          originalScope: row.originalScope ?? null,
        },
        co2: num(row.co2),
        ch4: num(row.ch4),
        n2o: num(row.n2o),
        totalCO2e: num(row.totalCO2e),
        year:
          row.year != null && Number.isFinite(row.year) ? row.year : undefined,
        rowIndex: i,
        sourceRowNumber,
        methodology: row.methodology?.trim() || undefined,
        activityAmount:
          row.activityAmount != null && Number.isFinite(row.activityAmount)
            ? row.activityAmount
            : undefined,
        activityUnit: row.activityUnit?.trim() || undefined,
        // Fuel/activity wins over category. Category used to be the sub-sector name.
        ...(() => {
          const activityType =
            row.activityType?.trim() || row.category?.trim() || undefined;
          return resolveNotationFromActivity({
            notationKey: row.notationKey?.trim() || undefined,
            activityType,
          });
        })(),
        activityDataSource: row.activityDataSource?.trim() || undefined,
        activityDataQuality: row.activityDataQuality?.trim() || undefined,
        emissionFactorUnit: row.emissionFactorUnit?.trim() || undefined,
        emissionFactorSource: row.emissionFactorSource?.trim() || undefined,
        emissionFactorDescription:
          row.emissionFactorDescription?.trim() || undefined,
        emissionFactorCO2: num(row.emissionFactorCO2),
        emissionFactorCH4: num(row.emissionFactorCH4),
        emissionFactorN2O: num(row.emissionFactorN2O),
        emissionFactorTotalCO2e: num(row.emissionFactorTotalCO2e),
      });
    }

    return {
      rows,
      errors,
      warnings,
      rowCount: extractedRows.length,
      validRowCount: rows.filter((r) => !r.errors?.length).length,
      rowsSkippedEmptyEmissions: countRowsSkippedEmptyEmissions(rows),
      inferredYearFromFile: inferredYear,
    };
  }

  /**
   * Extract gas value from row
   */
  private static extractGasValue(
    row: Record<string, unknown>,
    headers: string[],
    columnIndex: number | undefined,
  ): number | undefined {
    if (columnIndex === undefined) {
      return undefined;
    }

    const header = headers[columnIndex];
    const value = row[header];

    return parseNumericCell(value);
  }

  /** True when a header name is an emission-factor column, not a gas amount. */
  private static isEmissionFactorHeader(header: string): boolean {
    const h = header.toLowerCase().trim();
    return (
      h.includes("emission factor") ||
      h.startsWith("ef ") ||
      h.startsWith("ef_") ||
      /^ef[\s_-]/.test(h)
    );
  }

  /**
   * Read an EF value only from a column whose header looks like an EF column.
   * Rejects gas columns (co2, ch4, …) that older detectors may have bound.
   */
  private static extractEmissionFactorValue(
    row: Record<string, unknown>,
    headers: string[],
    detectedIndex: number | undefined,
    searchTerms: string[],
  ): number | undefined {
    if (
      detectedIndex !== undefined &&
      this.isEmissionFactorHeader(headers[detectedIndex] ?? "")
    ) {
      return this.extractGasValue(row, headers, detectedIndex);
    }
    const h = this.findHeader(headers, searchTerms, {
      requireEmissionFactorHeader: true,
    });
    return h
      ? this.extractGasValue(row, headers, headers.indexOf(h))
      : undefined;
  }

  /**
   * Find header by name (case-insensitive). Exact and "header contains term"
   * first; reverse contains only for headers of length ≥ 4 so short names
   * like "co2" do not match "emission factor - co2".
   */
  private static findHeader(
    headers: string[],
    searchTerms: string[],
    options: { requireEmissionFactorHeader?: boolean } = {},
  ): string | undefined {
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    const normalizedSearchTerms = searchTerms.map((t) =>
      t.toLowerCase().trim(),
    );
    const sortedTerms = [...normalizedSearchTerms].sort(
      (a, b) => b.length - a.length,
    );

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (
        options.requireEmissionFactorHeader &&
        !this.isEmissionFactorHeader(header)
      ) {
        continue;
      }
      for (const term of normalizedSearchTerms) {
        if (header === term) {
          return headers[i];
        }
      }
    }

    for (const term of sortedTerms) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const header = normalizedHeaders[i];
        if (
          options.requireEmissionFactorHeader &&
          !this.isEmissionFactorHeader(header)
        ) {
          continue;
        }
        if (header.includes(term)) {
          return headers[i];
        }
      }
    }

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (header.length < 4) {
        continue;
      }
      if (
        options.requireEmissionFactorHeader &&
        !this.isEmissionFactorHeader(header)
      ) {
        continue;
      }
      for (const term of sortedTerms) {
        if (term.includes(header)) {
          return headers[i];
        }
      }
    }

    return undefined;
  }
}
