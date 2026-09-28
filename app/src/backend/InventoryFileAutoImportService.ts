import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import FileParserService from "@/backend/FileParserService";
import FileValidatorService, {
  type ValidationResult,
} from "@/backend/FileValidatorService";
import FormatAdapterService from "@/backend/FormatAdapterService";
import ECRFImportService, {
  type ECRFImportResult,
} from "@/backend/ECRFImportService";
import InventoryImportService from "@/backend/InventoryImportService";
import InventoryFileStorageService, {
  isS3Configured,
} from "@/backend/InventoryFileStorageService";
import { db } from "@/models";
import { ImportStatusEnum } from "@/util/enums";
import {
  syncGHGIImportedInventorySource,
  syncGHGIInventory,
} from "@/backend/GHGINativeInputCatalogService";
import { logger } from "@/services/logger";

export class BulkInventoryImportAutoImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BulkInventoryImportAutoImportError";
  }
}

export type BulkInventoryAcceptedKind = "ecrf" | "near-ecrf";

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

function fileTypeOf(filename: string): "xlsx" | "csv" | "pdf" | "unknown" {
  const ext = extensionOf(filename);
  if (ext === "xlsx" || ext === "csv" || ext === "pdf") return ext;
  return "unknown";
}

/**
 * Chile MEED CSVs (scoped header markers) and CRFFormat packs detect as Adapter D (near-ecrf).
 * Bulk import accepts Path A eCRF and Adapter D; everything that needs OpenAI is not_ecrf.
 */
export function classifyBulkInventoryFile(validation: ValidationResult): {
  kind: BulkInventoryAcceptedKind | "not_ecrf" | "multi_city";
  detectedType: string;
} {
  if (validation.fileType === "pdf") {
    return { kind: "not_ecrf", detectedType: "pdf" };
  }
  if (validation.isCIRIS) {
    return { kind: "not_ecrf", detectedType: "ciris" };
  }
  if (validation.isBIOMATEC) {
    return { kind: "not_ecrf", detectedType: "biomatec" };
  }
  if (validation.isMultiCity) {
    return { kind: "multi_city", detectedType: "multi_city" };
  }
  if (validation.adapterType === "near-ecrf") {
    return { kind: "near-ecrf", detectedType: "near-ecrf" };
  }
  if (validation.adapterType) {
    return { kind: "not_ecrf", detectedType: validation.adapterType };
  }
  if (
    FileValidatorService.hasDistinctRequiredECRFColumns(
      validation.detectedColumns,
    )
  ) {
    return { kind: "ecrf", detectedType: "ecrf" };
  }
  return { kind: "not_ecrf", detectedType: "unknown" };
}

async function buildImportResult(args: {
  kind: BulkInventoryAcceptedKind;
  buffer: Buffer;
  fileType: "xlsx" | "csv";
  validation: ValidationResult;
  inventoryYear?: number | null;
}): Promise<ECRFImportResult> {
  const parsed = await FileParserService.parseFile(args.buffer, args.fileType);
  if (args.kind === "near-ecrf") {
    const extracted = FormatAdapterService.toExtractedRows(
      parsed,
      args.inventoryYear ?? undefined,
    );
    if (extracted.length === 0) {
      throw new BulkInventoryImportAutoImportError(
        "empty_file",
        "Adapter D: no data rows could be extracted from this file",
      );
    }
    return ECRFImportService.fromExtractedRows(extracted);
  }
  return ECRFImportService.processECRFFile(
    parsed,
    args.validation.detectedColumns || {},
  );
}

export interface AutoImportInventoryFileInput {
  buffer: Buffer;
  originalFileName: string;
  cityId?: string;
  inventoryId?: string;
  userId: string;
  replaceExisting?: boolean;
  dryRun?: boolean;
}

export interface AutoImportInventoryFileResult {
  importedFileId: string | null;
  importedRows: number;
  skippedRows: number;
  warnings: string[];
  kind: BulkInventoryAcceptedKind;
  contentDigest: string;
  dryRun: boolean;
}

async function clearInventoryEmissions(inventoryId: string): Promise<void> {
  const values = await db.models.InventoryValue.findAll({
    where: { inventoryId },
    attributes: ["id"],
  });
  const valueIds = values.map((value) => value.id);
  if (valueIds.length === 0) return;
  const activities = await db.models.ActivityValue.findAll({
    where: { inventoryValueId: valueIds },
    attributes: ["id"],
  });
  const activityIds = activities.map((activity) => activity.id);
  if (activityIds.length > 0) {
    await db.models.GasValue.destroy({
      where: { activityValueId: activityIds },
    });
  }
  await db.models.GasValue.destroy({ where: { inventoryValueId: valueIds } });
  await db.models.ActivityValue.destroy({
    where: { inventoryValueId: valueIds },
  });
  await db.models.InventoryValue.destroy({ where: { inventoryId } });
}

/**
 * Validate + parse + auto-approve eCRF / near-ecrf into an inventory.
 * Does not call OpenAI. Used by the bulk import worker.
 */
export class InventoryFileAutoImportService {
  static async importFile(
    input: AutoImportInventoryFileInput,
  ): Promise<AutoImportInventoryFileResult> {
    const originalFileName = basename(
      input.originalFileName.replace(/\\/g, "/"),
    );
    const fileType = fileTypeOf(originalFileName);
    if (fileType === "unknown" || fileType === "pdf") {
      throw new BulkInventoryImportAutoImportError(
        "not_ecrf",
        `Unsupported inventory format: ${fileType === "pdf" ? "pdf" : "unknown"}`,
      );
    }

    const file = new File([new Uint8Array(input.buffer)], originalFileName, {
      type: InventoryFileStorageService.mimeTypeForFileType(fileType),
    });
    const validation = await FileValidatorService.validateFileStructure(file);
    const classified = classifyBulkInventoryFile(validation);
    if (classified.kind === "not_ecrf" || classified.kind === "multi_city") {
      throw new BulkInventoryImportAutoImportError(
        classified.kind === "multi_city" ? "multi_city" : "not_ecrf",
        classified.kind === "multi_city"
          ? "File contains data for multiple cities"
          : `not_ecrf:${classified.detectedType}`,
      );
    }

    if (!input.dryRun && (!input.cityId || !input.inventoryId)) {
      throw new BulkInventoryImportAutoImportError(
        "missing_inventory",
        "Item is not matched to a city and inventory",
      );
    }

    const inventory = input.inventoryId
      ? await db.models.Inventory.findByPk(input.inventoryId, {
          attributes: ["inventoryId", "year"],
        })
      : null;
    if (input.inventoryId && !inventory) {
      throw new BulkInventoryImportAutoImportError(
        "missing_inventory",
        "Matched inventory was not found",
      );
    }

    const importResult = await buildImportResult({
      kind: classified.kind,
      buffer: input.buffer,
      fileType,
      validation,
      inventoryYear: inventory?.year,
    });

    const warnings = [...(validation.warnings || []), ...importResult.warnings];
    if (
      importResult.inferredYearFromFile != null &&
      inventory?.year != null &&
      importResult.inferredYearFromFile !== inventory.year
    ) {
      warnings.push("year_mismatch");
    }

    if (importResult.validRowCount === 0) {
      throw new BulkInventoryImportAutoImportError(
        "empty_file",
        importResult.errors.join("; ") || "No valid eCRF rows to import",
      );
    }

    const contentDigest = createHash("sha256")
      .update(input.buffer)
      .digest("hex");

    // Same file bytes already imported: skip unless the admin asked to replace.
    const already = input.inventoryId
      ? await db.models.ImportedInventoryFile.findOne({
          where: {
            inventoryId: input.inventoryId,
            contentDigest,
            importStatus: ImportStatusEnum.COMPLETED,
          },
        })
      : null;
    if (already && !input.replaceExisting) {
      logger.info(
        {
          inventoryId: input.inventoryId,
          importedFileId: already.id,
          replaceExisting: input.replaceExisting ?? false,
        },
        "Skipping bulk import: same content digest already completed",
      );
      return {
        importedFileId: already.id,
        importedRows: 0,
        skippedRows: importResult.rowCount,
        warnings: [...warnings, "already_imported"],
        kind: classified.kind,
        contentDigest,
        dryRun: Boolean(input.dryRun),
      };
    }
    if (already && input.replaceExisting) {
      logger.info(
        {
          inventoryId: input.inventoryId,
          importedFileId: already.id,
        },
        "Replacing prior import with matching content digest",
      );
    }

    if (input.dryRun) {
      return {
        importedFileId: null,
        importedRows: 0,
        skippedRows: 0,
        warnings: [...warnings, "dry_run"],
        kind: classified.kind,
        contentDigest,
        dryRun: true,
      };
    }

    const cityId = input.cityId;
    const inventoryId = input.inventoryId;
    if (!cityId || !inventoryId) {
      throw new BulkInventoryImportAutoImportError(
        "missing_inventory",
        "Item is not matched to a city and inventory",
      );
    }

    const existingForInventory = await db.models.ImportedInventoryFile.findOne({
      where: {
        inventoryId,
        importStatus: ImportStatusEnum.COMPLETED,
      },
    });
    if (existingForInventory && !input.replaceExisting) {
      throw new BulkInventoryImportAutoImportError(
        "already_imported",
        "Inventory already has a completed import; re-run with replaceExisting to overwrite",
      );
    }
    if (existingForInventory && input.replaceExisting) {
      await clearInventoryEmissions(inventoryId);
      await existingForInventory.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: "Superseded by a later bulk inventory import",
        lastUpdated: new Date(),
      });
    }

    const storedName = `${randomUUID()}-${originalFileName}`;
    const mimeType = InventoryFileStorageService.mimeTypeForFileType(fileType);
    let s3Key: string | undefined;
    let data: Buffer | undefined;
    if (isS3Configured()) {
      s3Key = await InventoryFileStorageService.uploadFile(
        input.buffer,
        cityId,
        inventoryId,
        storedName,
        mimeType,
      );
    } else {
      data = input.buffer;
    }

    const importedFile = await db.models.ImportedInventoryFile.create({
      id: randomUUID(),
      userId: input.userId,
      cityId,
      inventoryId,
      fileName: storedName,
      fileType,
      fileSize: input.buffer.length,
      contentDigest,
      s3Key: s3Key ?? null,
      data: data ?? null,
      originalFileName,
      importStatus: ImportStatusEnum.IMPORTING,
      validationResults: {
        errors: validation.errors,
        warnings,
        detectedColumns: validation.detectedColumns,
        adapterType: classified.kind === "near-ecrf" ? "near-ecrf" : undefined,
        inferredYearFromFile: importResult.inferredYearFromFile,
      },
      rowCount: importResult.rowCount,
    });

    await syncGHGIImportedInventorySource(importedFile, contentDigest);

    const summary = await InventoryImportService.importECRFData(
      inventoryId,
      importResult,
      { defaultActivityDataSource: originalFileName },
    );

    await importedFile.update({
      importStatus: ImportStatusEnum.COMPLETED,
      processedRowCount: summary.importedRows,
      completedAt: new Date(),
      lastUpdated: new Date(),
      validationResults: {
        ...(importedFile.validationResults as object),
        importSummary: summary,
      },
    });
    await syncGHGIInventory(importedFile);

    return {
      importedFileId: importedFile.id,
      importedRows: summary.importedRows,
      skippedRows: summary.skippedRows,
      warnings,
      kind: classified.kind,
      contentDigest,
      dryRun: false,
    };
  }
}
