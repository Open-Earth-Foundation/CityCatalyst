import createHttpError from "http-errors";
import FileParserService from "./FileParserService";

// File size limit: 20MB (in bytes)
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Accepted file formats for inventory import
export const ACCEPTED_FILE_FORMATS = ["xlsx", "csv"] as const;

export type AcceptedFileFormat = (typeof ACCEPTED_FILE_FORMATS)[number];

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileType?: AcceptedFileFormat;
  fileSize?: number;
  detectedColumns?: Record<string, number>; // Column name -> index mapping
}

/**
 * File Validator Service for inventory import files
 * Validates file type, size, and basic structure requirements
 */
export default class FileValidatorService {
  /**
   * Validate file type
   * @param file - File object to validate
   * @returns true if file type is accepted, throws error otherwise
   */
  public static validateFileType(file: File): AcceptedFileFormat {
    const fileExtension = file.name.split(".").pop()?.toLowerCase();

    if (!fileExtension) {
      throw new createHttpError.BadRequest(
        "File must have an extension. Accepted formats are: " +
          ACCEPTED_FILE_FORMATS.join(", "),
      );
    }

    if (!ACCEPTED_FILE_FORMATS.includes(fileExtension as AcceptedFileFormat)) {
      throw new createHttpError.BadRequest(
        `Invalid file type. Accepted formats are: ${ACCEPTED_FILE_FORMATS.join(", ")}`,
      );
    }

    return fileExtension as AcceptedFileFormat;
  }

  /**
   * Validate file size
   * @param file - File object to validate
   * @returns true if file size is within limit, throws error otherwise
   */
  public static validateFileSize(file: File): boolean {
    if (file.size > MAX_FILE_SIZE) {
      throw new createHttpError.BadRequest(
        `File too large. Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      );
    }

    if (file.size === 0) {
      throw new createHttpError.BadRequest("File cannot be empty");
    }

    return true;
  }

  /**
   * Validate file (type and size)
   * @param file - File object to validate
   * @returns ValidationResult with validation status and details
   */
  public static validateFile(file: File): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let fileType: AcceptedFileFormat | undefined;
    let fileSize: number | undefined;

    try {
      fileType = this.validateFileType(file);
    } catch (error) {
      if (error instanceof createHttpError.HttpError) {
        errors.push(error.message);
      } else {
        errors.push("Invalid file type");
      }
    }

    try {
      this.validateFileSize(file);
      fileSize = file.size;
    } catch (error) {
      if (error instanceof createHttpError.HttpError) {
        errors.push(error.message);
      } else {
        errors.push("Invalid file size");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileType,
      fileSize,
    };
  }

  /**
   * Validate file structure (GPC/eCRF structure requirements)
   * @param file - File object to validate
   * @returns ValidationResult with structure validation details
   */
  public static async validateFileStructure(
    file: File,
  ): Promise<ValidationResult> {
    // Basic validation first
    const basicValidation = this.validateFile(file);

    if (!basicValidation.isValid || !basicValidation.fileType) {
      return basicValidation;
    }

    const errors: string[] = [...basicValidation.errors];
    const warnings: string[] = [...basicValidation.warnings];
    const detectedColumns: Record<string, number> = {};

    try {
      // Convert file to buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Parse the file
      const parsedData = await FileParserService.parseFile(
        buffer,
        basicValidation.fileType,
      );

      // Validate structure based on file type
      if (parsedData.fileType === "xlsx") {
        // For eCRF XLSX files, validate sheet structure
        const structureValidation = this.validateECRFStructure(parsedData);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);
      } else {
        // For CSV files, validate single sheet structure
        const structureValidation = this.validateCSVStructure(parsedData);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);
      }

      // Detect and map required columns
      if (parsedData.primarySheet) {
        const columnMapping = this.detectRequiredColumns(
          parsedData.primarySheet.headers,
        );
        Object.assign(detectedColumns, columnMapping);
      }
    } catch (error) {
      errors.push(
        `Failed to parse file structure: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileType: basicValidation.fileType,
      fileSize: basicValidation.fileSize,
      detectedColumns:
        Object.keys(detectedColumns).length > 0 ? detectedColumns : undefined,
    };
  }

  /**
   * Validate eCRF XLSX file structure
   * @param parsedData - Parsed file data
   * @returns Object with errors and warnings arrays
   */
  private static validateECRFStructure(
    parsedData: Awaited<ReturnType<typeof FileParserService.parseFile>>,
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if primary sheet (eCRF_3) exists
    if (!parsedData.primarySheet) {
      errors.push("File does not contain a data sheet");
      return { errors, warnings };
    }

    const sheet = parsedData.primarySheet;

    // Check if sheet has data
    if (sheet.rows.length === 0) {
      errors.push("Data sheet is empty");
    }

    // Check for required columns
    const requiredColumns = [
      {
        name: "GPC ref. no.",
        alternatives: [
          "gpc ref",
          "gpc ref no",
          "reference number",
          "gpc reference",
        ],
      },
      { name: "CRF - Sector", alternatives: ["sector", "crf sector"] },
      {
        name: "CRF - Sub-sector",
        alternatives: ["subsector", "sub-sector", "crf sub-sector"],
      },
      { name: "Scope", alternatives: ["scope"] },
    ];

    for (const column of requiredColumns) {
      const found = FileParserService.detectColumn(sheet.headers, [
        column.name,
        ...column.alternatives,
      ]);

      if (found === -1) {
        errors.push(
          `Required column not found: ${column.name} (or similar: ${column.alternatives.join(", ")})`,
        );
      }
    }

    // Check for at least one gas value column
    const gasColumns = [
      {
        name: "GHGs (metric tonnes CO2e) - CO2",
        alternatives: ["co2", "ghg co2", "emission co2"],
      },
      {
        name: "GHGs (metric tonnes CO2e) - CH4",
        alternatives: ["ch4", "ghg ch4", "emission ch4"],
      },
      {
        name: "GHGs (metric tonnes CO2e) - N2O",
        alternatives: ["n2o", "ghg n2o", "emission n2o"],
      },
      {
        name: "GHGs (metric tonnes CO2e) - Total CO2e",
        alternatives: [
          "total co2e",
          "co2e",
          "total emissions",
          "co2 equivalent",
        ],
      },
    ];

    const foundGasColumns = gasColumns.filter((column) => {
      return (
        FileParserService.detectColumn(sheet.headers, [
          column.name,
          ...column.alternatives,
        ]) !== -1
      );
    });

    if (foundGasColumns.length === 0) {
      errors.push(
        "No gas value columns found. File must contain at least one of: CO2, CH4, N2O, or Total CO2e",
      );
    }

    // Check if at least one row has gas values
    if (sheet.rows.length > 0 && foundGasColumns.length > 0) {
      let hasGasData = false;
      for (const row of sheet.rows) {
        for (const gasColumn of foundGasColumns) {
          const columnIndex = FileParserService.detectColumn(sheet.headers, [
            gasColumn.name,
            ...gasColumn.alternatives,
          ]);
          if (columnIndex !== -1) {
            const value = FileParserService.getColumnValue(
              row,
              sheet.headers,
              columnIndex,
            );
            if (
              value !== null &&
              value !== undefined &&
              value !== "" &&
              (typeof value === "number" || !isNaN(Number(value)))
            ) {
              hasGasData = true;
              break;
            }
          }
        }
        if (hasGasData) break;
      }

      if (!hasGasData) {
        warnings.push(
          "No gas emission values found in data rows. File structure appears correct but contains no emission data.",
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate CSV file structure
   * @param parsedData - Parsed file data
   * @returns Object with errors and warnings arrays
   */
  private static validateCSVStructure(
    parsedData: Awaited<ReturnType<typeof FileParserService.parseFile>>,
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // CSV validation is similar to eCRF but simpler (single sheet)
    if (!parsedData.primarySheet) {
      errors.push("CSV file is empty or invalid");
      return { errors, warnings };
    }

    const sheet = parsedData.primarySheet;

    if (sheet.rows.length === 0) {
      errors.push("CSV file contains no data rows");
    }

    // Use same column validation as eCRF
    const eCRFValidation = this.validateECRFStructure(parsedData);
    errors.push(...eCRFValidation.errors);
    warnings.push(...eCRFValidation.warnings);

    return { errors, warnings };
  }

  /**
   * Detect and map required columns
   * @param headers - Array of header strings
   * @returns Map of column names to indices
   */
  private static detectRequiredColumns(
    headers: string[],
  ): Record<string, number> {
    const mapping: Record<string, number> = {};

    const columnsToDetect = [
      {
        key: "gpcRefNo",
        terms: ["gpc ref", "gpc ref no", "reference number", "gpc reference"],
      },
      { key: "sector", terms: ["crf - sector", "sector", "crf sector"] },
      {
        key: "subsector",
        terms: [
          "crf - sub-sector",
          "subsector",
          "sub-sector",
          "crf sub-sector",
        ],
      },
      { key: "scope", terms: ["scope"] },
      {
        key: "year",
        terms: [
          "year",
          "inventory year",
          "reporting year",
          "reference year",
          "inventory_year",
          "reporting_year",
        ],
      },
      {
        key: "co2",
        terms: [
          "ghgs (metric tonnes co2e) - co2",
          "co2",
          "ghg co2",
        ],
      },
      {
        key: "ch4",
        terms: [
          "ghgs (metric tonnes co2e) - ch4",
          "ch4",
          "ghg ch4",
        ],
      },
      {
        key: "n2o",
        terms: [
          "ghgs (metric tonnes co2e) - n2o",
          "n2o",
          "ghg n2o",
        ],
      },
      {
        key: "totalCO2e",
        // Prioritize the exact eCRF format first, then fallback to other variations
        terms: [
          "ghgs (metric tonnes co2e) - total co2e", // Exact eCRF format - highest priority
          "ghgs (metric tonnes co2e) - total", // Alternative eCRF format
          "total co2e", // Fallback
          "co2e", // Fallback
          "total emissions", // Fallback
          "co2 equivalent", // Fallback
        ],
      },
      {
        key: "notationKey",
        terms: ["notation key", "notation_key", "notation"],
      },
      // Activity data columns (optional)
      {
        key: "activityType",
        terms: ["activity type", "activity_type", "fuel type", "fuel_type"],
      },
      {
        key: "activityAmount",
        terms: [
          "activity data - amount",
          "activity_data - amount",
          "activity data-amount",
          "activity_data-amount",
          "activity amount",
          "activity_amount",
          "activity value",
          "activity_value",
        ],
      },
      {
        key: "activityUnit",
        terms: [
          "activity data - unit",
          "activity_data - unit",
          "activity data-unit",
          "activity_data-unit",
          "activity unit",
          "activity_unit",
          "activity units",
          "activity_units",
        ],
      },
      {
        key: "methodology",
        terms: ["methodology", "input methodology", "input_methodology"],
      },
      {
        key: "activityDataSource",
        terms: [
          "activity data - source",
          "activity_data - source",
          "activity data-source",
          "activity_data-source",
          "activity data source",
          "activity_data_source",
          "data source",
          "data_source",
        ],
      },
      {
        key: "activityDataQuality",
        terms: [
          "activity data quality",
          "activity_data_quality",
          "data quality",
          "data_quality",
        ],
      },
      {
        key: "emissionFactorSource",
        terms: [
          "emission factor source",
          "emission_factor_source",
          "ef source",
          "ef_source",
        ],
      },
      {
        key: "emissionFactorDescription",
        terms: [
          "emission factor description",
          "emission_factor_description",
          "ef description",
          "ef_description",
        ],
      },
      // Emission factor value columns (CO2, CH4, N2O, Unit, Total CO2e)
      {
        key: "emissionFactorUnit",
        terms: [
          "emission factor - unit",
          "emission factor unit",
          "ef unit",
          "ef_unit",
        ],
      },
      {
        key: "emissionFactorCO2",
        terms: [
          "emission factor - co2",
          "emission factor co2",
          "ef co2",
          "ef_co2",
        ],
      },
      {
        key: "emissionFactorCH4",
        terms: [
          "emission factor - ch4",
          "emission factor ch4",
          "ef ch4",
          "ef_ch4",
        ],
      },
      {
        key: "emissionFactorN2O",
        terms: [
          "emission factor - n2o",
          "emission factor n2o",
          "ef n2o",
          "ef_n2o",
        ],
      },
      {
        key: "emissionFactorTotalCO2e",
        terms: [
          "emission factor - total co2e",
          "emission factor total co2e",
          "ef total co2e",
          "ef_total co2e",
        ],
      },
    ];

    for (const column of columnsToDetect) {
      const index = FileParserService.detectColumn(headers, column.terms);
      if (index !== -1) {
        mapping[column.key] = index;
        console.log(
          `[FileValidator] Detected column "${column.key}" at index ${index} (header: "${headers[index]}")`,
        );
      } else {
        if (column.key === "totalCO2e" || column.key === "gpcRefNo") {
          console.log(
            `[FileValidator] Column "${column.key}" NOT FOUND. Searched terms: ${column.terms.join(", ")}`,
          );
        }
      }
    }

    return mapping;
  }
}
