import ECRFImportService, {
  type ECRFImportResult,
} from "@/backend/ECRFImportService";
import FileParserService from "@/backend/FileParserService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ImportedInventoryFile } from "@/models/ImportedInventoryFile";

export interface ImportValidationResults {
  adapterType?: string;
  detectedColumns?: Record<string, number>;
  headerKey?: string;
}

export interface BuiltImportResult {
  importResult: ECRFImportResult;
  /** Stored pre-extracted rows (PDF, AI-reshaped or near-eCRF) when they were the source. */
  extractedRows: ExtractedRow[] | null;
}

// Fields a user may correct per row on PDF/AI-extracted imports.
const ALLOWED_ROW_OVERRIDE_KEYS = new Set([
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
]);

/**
 * Apply user overrides to an extracted row. Only allowed keys are applied;
 * used for manual correction of sector/subsector/category etc. per row.
 */
function applyRowOverrides(
  base: ExtractedRow,
  overrides: Record<string, unknown>,
): ExtractedRow {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (!ALLOWED_ROW_OVERRIDE_KEYS.has(key)) continue;
    if (value === null || value === undefined) {
      (out as Record<string, unknown>)[key] = null;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    if (typeof value === "string") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/**
 * Builds the rows an uploaded file will import, exactly as approval does, so
 * the mapping preview and the real import cannot disagree.
 *
 * mappingOverrides: for xlsx/csv, column name -> field key; for extracted rows,
 * row index (stringified) -> per-row field overrides.
 */
export async function buildImportResult(
  importedFile: ImportedInventoryFile,
  mappingOverrides?: Record<string, unknown>,
): Promise<BuiltImportResult> {
  const mappingConfiguration = (importedFile.mappingConfiguration || {}) as {
    rows?: unknown;
    keyValueShaped?: boolean;
  };
  const validationResults =
    (importedFile.validationResults as ImportValidationResults) || {};
  const adapterType = validationResults.adapterType;

  // Pre-extracted rows: PDF, Path B key-value, or Adapter D (near-ecrf) — no file re-parse.
  const storedRows = mappingConfiguration.rows as ExtractedRow[] | undefined;
  const useExtractedRows =
    Array.isArray(storedRows) &&
    storedRows.length > 0 &&
    (importedFile.fileType === "pdf" ||
      mappingConfiguration.keyValueShaped === true ||
      adapterType === "near-ecrf");

  if (useExtractedRows) {
    const correctedRows = storedRows.map((row, index) => {
      const rowOverrides = mappingOverrides?.[String(index)];
      return rowOverrides && typeof rowOverrides === "object"
        ? applyRowOverrides(row, rowOverrides as Record<string, unknown>)
        : row;
    });
    let importResult = await ECRFImportService.fromExtractedRows(correctedRows);

    // Near-eCRF uploads stored before sector-column extraction was fixed may have
    // no resolvable rows; re-parse from S3/BYTEA using the full eCRF pipeline.
    if (
      adapterType === "near-ecrf" &&
      importResult.validRowCount === 0 &&
      importResult.rowCount > 0
    ) {
      const fileBuffer =
        await InventoryFileStorageService.resolveImportedFileBuffer(
          importedFile,
        );
      if (fileBuffer) {
        const parsedData = await FileParserService.parseFile(
          fileBuffer,
          importedFile.fileType,
        );
        importResult = await ECRFImportService.processECRFFile(parsedData, {
          ...(validationResults.detectedColumns || {}),
        });
      }
    }
    return { importResult, extractedRows: storedRows };
  }

  // xlsx/csv (column-mapped, not key-value shaped): parse file and process with ECRF pipeline
  const fileBuffer =
    await InventoryFileStorageService.resolveImportedFileBuffer(importedFile);
  if (!fileBuffer) {
    throw new Error("File data not found");
  }
  const parsedData = await FileParserService.parseFile(
    fileBuffer,
    importedFile.fileType,
  );
  const detectedColumns: Record<string, number> = {
    ...(validationResults.detectedColumns || {}),
  };

  // Apply mapping overrides: columnName -> key; resolve column name to index
  if (
    mappingOverrides &&
    Object.keys(mappingOverrides).length > 0 &&
    parsedData.primarySheet
  ) {
    const headers = parsedData.primarySheet.headers;
    for (const [columnName, key] of Object.entries(mappingOverrides)) {
      if (!key || typeof key !== "string") continue;
      const idx = headers.findIndex((h) => h === columnName);
      if (idx !== -1) {
        detectedColumns[key] = idx;
      }
    }
  }

  const importResult = await ECRFImportService.processECRFFile(
    parsedData,
    detectedColumns,
  );
  return { importResult, extractedRows: null };
}
