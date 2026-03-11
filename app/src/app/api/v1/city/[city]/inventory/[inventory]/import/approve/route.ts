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
import FileParserService from "@/backend/FileParserService";
import ECRFImportService, {
  type ECRFImportResult,
  type ECRFRowData,
} from "@/backend/ECRFImportService";
import InventoryImportService from "@/backend/InventoryImportService";
import { resolveGpcRefNo } from "@/util/GHGI/gpc-ref-resolver";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/services/logger";
import { Op } from "sequelize";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";

const approveImportSchema = z.object({
  importedFileId: z.string().uuid(),
  mappingOverrides: z.record(z.any()).optional(),
});

/** Quick response so request returns before ingress timeout; import runs in background. */
export const maxDuration = 30;

/**
 * Apply user overrides to a PDF-extracted row. Only allowed keys are applied;
 * used for manual correction of sector/subsector/category etc. per row.
 */
function applyPdfFieldOverrides(
  base: ExtractedRow,
  overrides: Record<string, unknown>,
  allowedKeys: Set<string>,
): ExtractedRow {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedKeys.has(key)) continue;
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

  try {
    const mappingConfiguration = (importedFile.mappingConfiguration || {}) as {
      overrides?: Record<string, any>;
      rows?: unknown;
      keyValueShaped?: boolean;
    };
    const mappingOverrides = mappingConfiguration.overrides;

    const validationResults = (importedFile.validationResults as any) || {};
    let importResult: ECRFImportResult;

    // Path C (PDF) or Path B key-value: AI-shaped rows – convert ExtractedRow[] to ECRF format (no file parse).
    // mappingOverrides: per-row field overrides keyed by row index (e.g. { "0": { sector: "X", subsector: "Y" } }).
    const extractedRows = mappingConfiguration.rows as ExtractedRow[] | undefined;
    const keyValueShaped = mappingConfiguration.keyValueShaped === true;
    const useExtractedRows =
      (importedFile.fileType === "pdf" || keyValueShaped) &&
      Array.isArray(extractedRows) &&
      extractedRows.length > 0;

    if (useExtractedRows) {
      const errors: string[] = [];
      const warnings: string[] = [];
      const rows: ECRFRowData[] = [];
      let inferredYear: number | undefined;

      const scopeByName = new Map<string, string>();
      const scopeRecords = await db.models.Scope.findAll({
        attributes: ["scopeId", "scopeName"],
        where: { scopeName: { [Op.in]: ["1", "2", "3"] } },
      });
      for (const s of scopeRecords) {
        if (s.scopeName) scopeByName.set(s.scopeName, s.scopeId);
      }

      const allowedPdfOverrideKeys = new Set([
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

      for (let i = 0; i < extractedRows.length; i++) {
        const baseRow = extractedRows[i];
        const rowOverrides =
          mappingOverrides &&
          typeof mappingOverrides[String(i)] === "object" &&
          mappingOverrides[String(i)] !== null
            ? (mappingOverrides[String(i)] as Record<string, unknown>)
            : null;
        const row: ExtractedRow = rowOverrides
          ? applyPdfFieldOverrides(baseRow, rowOverrides, allowedPdfOverrideKeys)
          : baseRow;

        const sector = row.sector?.trim() ?? "";
        const subsector = row.subsector?.trim() ?? "";
        const gpcRefNo =
          row.gpcRefNo?.trim() ||
          resolveGpcRefNo(sector, subsector, row.category?.trim()) ||
          null;

        if (!gpcRefNo) {
          errors.push(
            `Row ${i + 1}: Could not resolve GPC ref from sector "${sector}" and subsector "${subsector}"`,
          );
          rows.push({
            gpcRefNo: "",
            sectorId: "",
            subsectorId: "",
            subcategoryId: null,
            scopeId: "",
            rowIndex: i,
            errors: [
              `Could not resolve GPC ref from sector "${sector}" and subsector "${subsector}"`,
            ],
          });
          continue;
        }

        const gpcMapping = await ECRFImportService.lookupGPCReference(gpcRefNo);
        if (!gpcMapping) {
          errors.push(`Row ${i + 1}: GPC reference "${gpcRefNo}" not in taxonomy`);
          rows.push({
            gpcRefNo,
            sectorId: "",
            subsectorId: "",
            subcategoryId: null,
            scopeId: "",
            rowIndex: i,
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
          inferredYear = inferredYear != null ? inferredYear : (row.year as number);
        }

        rows.push({
          gpcRefNo,
          sectorId: gpcMapping.sectorId,
          subsectorId: gpcMapping.subsectorId,
          subcategoryId: gpcMapping.subcategoryId,
          scopeId: resolvedScopeId,
          co2: num(row.co2),
          ch4: num(row.ch4),
          n2o: num(row.n2o),
          totalCO2e: num(row.totalCO2e),
          year: row.year != null && Number.isFinite(row.year) ? row.year : undefined,
          rowIndex: i,
          methodology: row.methodology?.trim() || undefined,
          activityAmount:
            row.activityAmount != null && Number.isFinite(row.activityAmount)
              ? row.activityAmount
              : undefined,
          activityUnit: row.activityUnit?.trim() || undefined,
          activityType: row.category?.trim() || row.activityType?.trim() || undefined,
          activityDataSource: row.activityDataSource?.trim() || undefined,
          activityDataQuality: row.activityDataQuality?.trim() || undefined,
        });
      }

      importResult = {
        rows,
        errors,
        warnings,
        rowCount: extractedRows.length,
        validRowCount: rows.filter((r) => !r.errors?.length).length,
        inferredYearFromFile: inferredYear,
      };
    } else {
      // xlsx/csv (column-mapped, not key-value shaped): parse file and process with ECRF pipeline
      if (!importedFile.data) {
        throw new Error("File data not found");
      }

      const buffer = Buffer.from(importedFile.data as any);
      const parsedData = await FileParserService.parseFile(
        buffer,
        importedFile.fileType,
      );

      const validationResults = importedFile.validationResults as any;
      const detectedColumns: Record<string, number> = {
        ...(validationResults?.detectedColumns || {}),
      };

      // Apply mapping overrides: columnName -> key; resolve column name to index
      if (
        mappingOverrides &&
        Object.keys(mappingOverrides).length > 0 &&
        parsedData.primarySheet
      ) {
        const headers = parsedData.primarySheet.headers;
        for (const [columnName, key] of Object.entries(mappingOverrides)) {
          if (!key) continue;
          const idx = headers.findIndex((h) => h === columnName);
          if (idx !== -1) {
            detectedColumns[key] = idx;
          }
        }
      }

      importResult = await ECRFImportService.processECRFFile(
        parsedData,
        detectedColumns,
      );
    }

    const defaultActivityDataSource =
      (importedFile.originalFileName as string) ||
      (importedFile.fileName as string) ||
      (importedFile.fileType === "pdf" ? "Imported from PDF" : "Imported from file");

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
        ...validationResults,
        importSummary,
      },
    });

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
