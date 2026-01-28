import { db } from "@/models";
import FileParserService, { type ParsedFileData } from "./FileParserService";

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
  errors?: string[];
  warnings?: string[];
}

export interface ECRFImportResult {
  rows: ECRFRowData[];
  errors: string[];
  warnings: string[];
  rowCount: number;
  validRowCount: number;
  /** First non-null year from file when a year column is mapped (inventory year). */
  inferredYearFromFile?: number;
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
      };
    }

    const sheet = parsedData.primarySheet;
    const headers = sheet.headers;

    // Validate required columns
    if (detectedColumns.gpcRefNo === undefined) {
      errors.push("GPC reference number column not found");
      return {
        rows: [],
        errors,
        warnings,
        rowCount: sheet.rows.length,
        validRowCount: 0,
      };
    }

    // Process each row
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];

      // Extract GPC reference number
      const gpcRefNoHeader = headers[detectedColumns.gpcRefNo];
      const gpcRefNo = row[gpcRefNoHeader]?.toString().trim();

      if (!gpcRefNo) {
        rowWarnings.push("No GPC reference number found");
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
          errors: rowErrors,
          warnings: rowWarnings,
        });
        continue;
      }

      // Extract gas values
      const co2 = this.extractGasValue(
        row,
        headers,
        detectedColumns.co2,
        "CO2",
      );
      const ch4 = this.extractGasValue(
        row,
        headers,
        detectedColumns.ch4,
        "CH4",
      );
      const n2o = this.extractGasValue(
        row,
        headers,
        detectedColumns.n2o,
        "N2O",
      );
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
          ? this.extractGasValue(
              row,
              headers,
              totalCO2eColumnIndex,
              "Total CO2e",
            )
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
      const notationKeyHeader = this.findHeader(headers, [
        "notation key",
        "notation_key",
        "notation",
      ]);
      const notationKey = notationKeyHeader
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

      // Extract activity data fields (optional)
      const activityTypeHeader = this.findHeader(headers, [
        "activity type",
        "activity_type",
        "fuel type",
        "fuel_type",
      ]);
      const activityType = activityTypeHeader
        ? row[activityTypeHeader]?.toString().trim()
        : undefined;

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
      // Extract activity amount value (convert to number like extractGasValue does)
      let activityAmount: number | undefined = undefined;
      if (activityAmountHeader) {
        const value = row[activityAmountHeader];
        if (value !== null && value !== undefined && value !== "") {
          const numValue = typeof value === "number" ? value : Number(value);
          if (!isNaN(numValue)) {
            activityAmount = numValue;
          }
        }
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

      const emissionFactorCO2Idx =
        detectedColumns.emissionFactorCO2 ?? (() => {
          const h = this.findHeader(headers, [
            "emission factor - co2",
            "emission factor co2",
            "ef co2",
            "ef_co2",
          ]);
          return h ? headers.indexOf(h) : undefined;
        })();
      const emissionFactorCO2 =
        emissionFactorCO2Idx !== undefined
          ? this.extractGasValue(
              row,
              headers,
              emissionFactorCO2Idx,
              "Emission Factor CO2",
            )
          : undefined;

      const emissionFactorCH4Idx =
        detectedColumns.emissionFactorCH4 ?? (() => {
          const h = this.findHeader(headers, [
            "emission factor - ch4",
            "emission factor ch4",
            "ef ch4",
            "ef_ch4",
          ]);
          return h ? headers.indexOf(h) : undefined;
        })();
      const emissionFactorCH4 =
        emissionFactorCH4Idx !== undefined
          ? this.extractGasValue(
              row,
              headers,
              emissionFactorCH4Idx,
              "Emission Factor CH4",
            )
          : undefined;

      const emissionFactorN2OIdx =
        detectedColumns.emissionFactorN2O ?? (() => {
          const h = this.findHeader(headers, [
            "emission factor - n2o",
            "emission factor n2o",
            "ef n2o",
            "ef_n2o",
          ]);
          return h ? headers.indexOf(h) : undefined;
        })();
      const emissionFactorN2O =
        emissionFactorN2OIdx !== undefined
          ? this.extractGasValue(
              row,
              headers,
              emissionFactorN2OIdx,
              "Emission Factor N2O",
            )
          : undefined;

      const emissionFactorTotalCO2eIdx =
        detectedColumns.emissionFactorTotalCO2e ?? (() => {
          const h = this.findHeader(headers, [
            "emission factor - total co2e",
            "emission factor total co2e",
            "ef total co2e",
            "ef_total co2e",
          ]);
          return h ? headers.indexOf(h) : undefined;
        })();
      const emissionFactorTotalCO2e =
        emissionFactorTotalCO2eIdx !== undefined
          ? this.extractGasValue(
              row,
              headers,
              emissionFactorTotalCO2eIdx,
              "Emission Factor Total CO2e",
            )
          : undefined;

      // Validate that at least one gas value is present
      if (!co2 && !ch4 && !n2o && !totalCO2e && !notationKey) {
        rowWarnings.push("No gas values or notation key found");
      }

      rows.push({
        gpcRefNo,
        sectorId: gpcMapping.sectorId,
        subsectorId: gpcMapping.subsectorId,
        subcategoryId: gpcMapping.subcategoryId,
        scopeId: gpcMapping.scopeId,
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
        errors: rowErrors.length > 0 ? rowErrors : undefined,
        warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
      });
    }

    const validRows = rows.filter((r) => !r.errors || r.errors.length === 0);
    if (validRows.length === 0) {
      errors.push("No valid rows found in file");
    }

    const inferredYearFromFile = rows.find((r) => r.year != null)?.year;

    return {
      rows,
      errors,
      warnings,
      rowCount: rows.length,
      validRowCount: validRows.length,
      inferredYearFromFile,
    };
  }

  /**
   * Look up GPC reference number in database
   * For sectors I-III: looks up SubCategory by referenceNumber
   * For sectors IV-V (IPPU and AFOLU): looks up SubSector by referenceNumber (no subcategories)
   */
  private static async lookupGPCReference(gpcRefNo: string): Promise<{
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
      const subsector = (subcategory as any).subsector;
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

    const sector = (subsector as any).sector;
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
   * Extract gas value from row
   */
  private static extractGasValue(
    row: Record<string, any>,
    headers: string[],
    columnIndex: number | undefined,
    gasName: string,
  ): number | undefined {
    if (columnIndex === undefined) {
      return undefined;
    }

    const header = headers[columnIndex];
    const value = row[header];

    if (value === null || value === undefined || value === "") {
      return undefined;
    }

    // Try to convert to number
    const numValue = typeof value === "number" ? value : Number(value);

    if (isNaN(numValue)) {
      return undefined;
    }

    return numValue;
  }

  /**
   * Find header by name (case-insensitive)
   */
  private static findHeader(
    headers: string[],
    searchTerms: string[],
  ): string | undefined {
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    const normalizedSearchTerms = searchTerms.map((t) =>
      t.toLowerCase().trim(),
    );

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      for (const term of normalizedSearchTerms) {
        if (header.includes(term) || term.includes(header)) {
          return headers[i];
        }
      }
    }

    return undefined;
  }
}
