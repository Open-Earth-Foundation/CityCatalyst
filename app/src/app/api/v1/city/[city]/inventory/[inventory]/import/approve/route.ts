/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/approve:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: approveInventoryImport
 *     summary: Approve import mappings and trigger processing.
 *     description: |
 *       Approves the mappings for an imported inventory file and starts the inventory import.
 *       Returns 202 Accepted and runs the heavy import in the background. Client should poll
 *       GET .../import/{importedFileId} until importStatus is completed or failed.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               importedFileId:
 *                 type: string
 *                 format: uuid
 *               mappingOverrides:
 *                 type: object
 *                 description: |
 *                   Optional overrides. For xlsx/csv, maps column header to internal key (e.g. {"Sector Name": "sector"}).
 *                   For PDF imports, per-row field overrides keyed by row index (e.g. {"0": {"sector": "Stationary Energy", "subsector": "Residential Buildings"}}) to correct extracted values.
 *     responses:
 *       202:
 *         description: Import started; poll GET import status until completion.
 *       400:
 *         description: Invalid request or mappings cannot be approved.
 *       404:
 *         description: Import file not found.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import FileParserService from "@/backend/FileParserService";
import {
  buildImportResult,
  type ImportValidationResults,
} from "@/backend/ImportResultBuilder";
import InventoryImportService from "@/backend/InventoryImportService";
import {
  syncGHGIImportedInventorySource,
  syncGHGIInventory,
} from "@/backend/GHGINativeInputCatalogService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/services/logger";
import { v4 as uuidv4 } from "uuid";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";

const approveImportSchema = z.object({
  importedFileId: z.string().uuid(),
  mappingOverrides: z.record(z.any()).optional(),
});

/** Quick response so request returns before ingress timeout; import runs in background. */
export const maxDuration = 30;

/**
 * Derive a column→field mapping from the raw file headers and the approved ExtractedRow[] set.
 * For each ExtractedRow field that has a non-null value, we try to find which original header
 * most likely maps to it by checking if the normalised header contains the field name substring.
 * This is best-effort; the AI prompt hint is used only as a warm-start, not a hard constraint.
 */
function deriveColumnMapping(
  headers: string[],
  rows: ExtractedRow[],
): Record<string, string> {
  const FIELD_HINTS: Array<[keyof ExtractedRow, string[]]> = [
    ["sector", ["sector"]],
    ["subsector", ["subsector", "sub-sector", "category"]],
    ["scope", ["scope"]],
    ["totalCO2e", ["co2e", "emission", "ghg", "total"]],
    ["co2", ["co2"]],
    ["ch4", ["ch4"]],
    ["n2o", ["n2o"]],
    ["gpcRefNo", ["gpc", "reference", "ref"]],
    ["source", ["source", "fuel", "data source"]],
    ["activityAmount", ["activity", "amount", "value", "quantity"]],
    ["activityUnit", ["unit"]],
    ["year", ["year"]],
  ];

  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  for (const [field, hints] of FIELD_HINTS) {
    const hasValues = rows.some((r) => r[field] != null);
    if (!hasValues) continue;

    const matched = headers.find(
      (h) =>
        !usedHeaders.has(h) &&
        hints.some((hint) => h.toLowerCase().includes(hint)),
    );
    if (matched) {
      mapping[matched] = field as string;
      usedHeaders.add(matched);
    }
  }

  return mapping;
}

/**
 * Persist approved column mapping + example rows for the given city × header key.
 * Uses upsert so re-uploads of the same file structure update existing feedback.
 */
async function persistMappingFeedback(args: {
  cityId: string;
  headerKey: string;
  adapterType?: string;
  columnMapping: Record<string, string>;
  exampleRows: Record<string, unknown>[];
}): Promise<void> {
  const { cityId, headerKey, adapterType, columnMapping, exampleRows } = args;

  if (!headerKey || Object.keys(columnMapping).length === 0) return;

  try {
    const existing = await db.models.ImportMappingFeedback.findOne({
      where: { cityId, headerKey },
    });

    if (existing) {
      await existing.update({
        adapterType: adapterType ?? existing.adapterType,
        columnMapping,
        exampleRows,
        lastUpdated: new Date(),
      });
    } else {
      await db.models.ImportMappingFeedback.create({
        id: uuidv4(),
        cityId,
        headerKey,
        adapterType: adapterType ?? null,
        columnMapping,
        exampleRows,
      });
    }

    logger.info(
      {
        cityId,
        headerKey,
        adapterType,
        columnCount: Object.keys(columnMapping).length,
      },
      "ImportMappingFeedback upserted",
    );
  } catch (err) {
    logger.warn(
      { err, cityId, headerKey },
      "Failed to persist mapping feedback (non-fatal)",
    );
  }
}

async function runApproveImportInBackground(args: {
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  userId: string;
}): Promise<void> {
  const { cityId, inventoryId, importedFileId, userId } = args;

  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
      userId,
    },
  });

  if (!importedFile) {
    logger.warn(
      { importedFileId, inventoryId, cityId, userId },
      "Background approve/import: file not found",
    );
    return;
  }

  await syncGHGIImportedInventorySource(importedFile);

  try {
    const mappingConfiguration = (importedFile.mappingConfiguration || {}) as {
      // For xlsx/csv: columnName -> internal key (string). For PDF imports:
      // row index (stringified) -> per-row field overrides (object).
      overrides?: Record<string, unknown>;
    };
    const { importResult, extractedRows } = await buildImportResult(
      importedFile,
      mappingConfiguration.overrides,
    );

    const defaultActivityDataSource =
      (importedFile.originalFileName as string) ||
      (importedFile.fileName as string) ||
      (importedFile.fileType === "pdf"
        ? "Imported from PDF"
        : "Imported from file");

    const importSummary = await InventoryImportService.importECRFData(
      inventoryId,
      importResult,
      { defaultActivityDataSource },
    );

    await importedFile.update({
      importStatus: ImportStatusEnum.COMPLETED,
      processedRowCount: importSummary.importedRows,
      completedAt: new Date(),
      lastUpdated: new Date(),
      validationResults: {
        ...((importedFile.validationResults as ImportValidationResults) ?? {}),
        importSummary,
      },
    });
    await syncGHGIInventory(importedFile);

    // Persist mapping feedback for Path B (AI-shaped) files so future uploads
    // with the same header structure get a warm-start prompt hint.
    if (extractedRows && extractedRows.length > 0) {
      const vr =
        (importedFile.validationResults as ImportValidationResults) ?? {};
      const headerKey = vr.headerKey;
      if (headerKey) {
        const feedbackBuffer =
          await InventoryFileStorageService.resolveImportedFileBuffer(
            importedFile,
          );
        const rawHeaders: string[] = feedbackBuffer
          ? await FileParserService.parseFile(
              feedbackBuffer,
              importedFile.fileType,
            )
              .then((p) => p.primarySheet?.headers ?? [])
              .catch(() => [])
          : [];

        const columnMapping =
          rawHeaders.length > 0
            ? deriveColumnMapping(rawHeaders, extractedRows)
            : {};
        const exampleRows = extractedRows.slice(0, 5) as unknown as Record<
          string,
          unknown
        >[];

        await persistMappingFeedback({
          cityId,
          headerKey,
          adapterType: vr.adapterType,
          columnMapping,
          exampleRows,
        });
      }
    }

    logger.info(
      {
        importedFileId: importedFile.id,
        inventoryId,
        importedRows: importSummary.importedRows,
      },
      "Import completed successfully",
    );
  } catch (error) {
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: error instanceof Error ? error.message : "Unknown error",
      lastUpdated: new Date(),
    });

    logger.error(
      { err: error, importedFileId: importedFile.id },
      "Failed to import data into inventory",
    );
  }
}

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);

    // Validate user access to inventory
    await UserService.findUserInventory(inventoryId, session);

    // Parse request body
    const body = await req.json();
    const { importedFileId, mappingOverrides } =
      approveImportSchema.parse(body);

    // Find the imported file
    const importedFile = await db.models.ImportedInventoryFile.findOne({
      where: {
        id: importedFileId,
        inventoryId,
        cityId,
        userId: session.user.id,
      },
    });

    if (!importedFile) {
      throw new createHttpError.NotFound(
        "Imported file not found or access denied",
      );
    }

    // Validate that the file is in a state that can be approved
    if (importedFile.importStatus !== ImportStatusEnum.WAITING_FOR_APPROVAL) {
      throw new createHttpError.BadRequest(
        `Cannot approve import with status: ${importedFile.importStatus}. Expected status: ${ImportStatusEnum.WAITING_FOR_APPROVAL}`,
      );
    }

    // Check if this inventory already contains data (InventoryValue records)
    // to prevent duplicate imports
    const existingValueCount = await db.models.InventoryValue.count({
      where: { inventoryId },
    });
    if (existingValueCount > 0) {
      throw new createHttpError.Conflict(
        "This inventory already contains data. Clear existing data before importing again.",
      );
    }

    // Update mapping configuration if overrides provided
    let mappingConfiguration = importedFile.mappingConfiguration || {};
    if (mappingOverrides) {
      mappingConfiguration = {
        ...mappingConfiguration,
        overrides: mappingOverrides,
      };
    }

    // Update import status to APPROVED, then start background import
    await importedFile.update({
      importStatus: ImportStatusEnum.APPROVED,
      mappingConfiguration,
      errorLog: null,
      lastUpdated: new Date(),
    });

    await importedFile.update({
      importStatus: ImportStatusEnum.IMPORTING,
      lastUpdated: new Date(),
    });

    runApproveImportInBackground({
      cityId,
      inventoryId,
      importedFileId,
      userId: session.user.id,
    }).catch((err) =>
      logger.error({ err, importedFileId }, "Approve/import background failed"),
    );

    return NextResponse.json(
      {
        data: {
          accepted: true,
          id: importedFileId,
          message:
            "Import started; poll GET import status until importStatus is completed or failed.",
        },
      },
      { status: 202 },
    );
  },
);
