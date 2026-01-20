/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}:
 *   get:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: getInventoryImportStatus
 *     summary: Get import status and step-specific data for the 4-step import workflow.
 *     description: |
 *       Retrieves step-specific data for the 4-step import workflow:
 *       1. Upload file - Basic file information
 *       2. Validation results - Detected columns with interpretations
 *       3. Mapping columns - Column mapping interface data
 *       4. Review and confirm - Summary and final mapping preview
 *       
 *       The response includes `currentStep` (1-4) indicating which step the user should be on based on the import status.
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
 *       - in: path
 *         name: importedFileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Import file status and mappings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     importStatus:
 *                       type: string
 *                       enum: [uploaded, processing, waiting_for_approval, approved, importing, completed, failed]
 *                     currentStep:
 *                       type: integer
 *                       enum: [1, 2, 3, 4]
 *                       description: Current step in the 4-step workflow
 *                     fileInfo:
 *                       type: object
 *                       description: Step 1 - Basic file information
 *                       properties:
 *                         fileName:
 *                           type: string
 *                         originalFileName:
 *                           type: string
 *                         fileType:
 *                           type: string
 *                           enum: [xlsx, csv]
 *                         fileSize:
 *                           type: integer
 *                     validationResults:
 *                       type: object
 *                       nullable: true
 *                       description: Step 2 - Validation results with detected columns
 *                       properties:
 *                         totalColumnsDetected:
 *                           type: integer
 *                         columns:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               columnName:
 *                                 type: string
 *                               interpretedAs:
 *                                 type: string
 *                                 nullable: true
 *                               status:
 *                                 type: string
 *                                 enum: [detected, manual]
 *                               exampleValue:
 *                                 type: string
 *                                 nullable: true
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                         warnings:
 *                           type: array
 *                           items:
 *                             type: string
 *                     columnMappings:
 *                       type: object
 *                       nullable: true
 *                       description: Step 3 - Column mapping data (same structure as validationResults)
 *                     reviewData:
 *                       type: object
 *                       nullable: true
 *                       description: Step 4 - Review and confirmation data
 *                       properties:
 *                         importSummary:
 *                           type: object
 *                           properties:
 *                             sourceFile:
 *                               type: string
 *                             formatDetected:
 *                               type: string
 *                             rowsFound:
 *                               type: integer
 *                             fieldsMapped:
 *                               type: integer
 *                         fieldMappings:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sourceColumn:
 *                                 type: string
 *                               mappedField:
 *                                 type: string
 *                         mappingPreview:
 *                           type: object
 *                           description: Side-by-side comparison of eCRF rows with required GPC rows
 *                     rowCount:
 *                       type: integer
 *                     processedRowCount:
 *                       type: integer
 *                     errorLog:
 *                       type: string
 *                       nullable: true
 *                     created:
 *                       type: string
 *                       format: date-time
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       404:
 *         description: Import file not found.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import ImportMappingService from "@/backend/ImportMappingService";
import FileParserService from "@/backend/FileParserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const GET = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);
    const importedFileId = z.string().uuid().parse(params.importedFileId);

    // Validate user access to inventory
    await UserService.findUserInventory(inventoryId, session);

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

    // Get the inventory to determine required GPC rows
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId: inventoryId },
    });

    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    // Determine current step based on import status
    let currentStep: 1 | 2 | 3 | 4 = 1;
    if (importedFile.importStatus === "processing") {
      currentStep = 2; // Validation results
    } else if (importedFile.importStatus === "waiting_for_approval") {
      currentStep = 3; // Mapping columns (or 4 for review, determined by presence of mapping overrides)
      // If mappingConfiguration has user mappings, we're on step 4
      if (
        importedFile.mappingConfiguration?.userMappings ||
        importedFile.mappingConfiguration?.mappingsApplied
      ) {
        currentStep = 4; // Review and confirm
      }
    }

    // Step 2: Validation Results - Get detected columns with interpretations
    let validationStepData = null;
    if (currentStep >= 2 && importedFile.validationResults?.detectedColumns) {
      let detectedColumnsList: Array<{
        columnName: string;
        interpretedAs: string | null;
        status: "detected" | "manual";
        exampleValue: string | null;
      }> = [];

      if (importedFile.data) {
        try {
          // Parse file to get actual headers and sample values
          const parsedData = await FileParserService.parseFile(
            importedFile.data,
            importedFile.fileType,
          );

          if (parsedData.primarySheet) {
            const headers = parsedData.primarySheet.headers;
            const firstRow = parsedData.primarySheet.rows[0] || {};

            // Map of detected column keys to GPC field names
            const gpcFieldNames: Record<string, string> = {
              gpcRefNo: "GPC Reference Number",
              sector: "Sector",
              subsector: "Subsector",
              scope: "Scope",
              co2: "CO2",
              ch4: "CH4",
              n2o: "N2O",
              totalCO2e: "Total CO2e",
              activityType: "Activity Type / Fuel Type",
              activityAmount: "Activity Amount",
              activityUnit: "Activity Unit",
              methodology: "Methodology",
              activityDataSource: "Activity Data Source",
              activityDataQuality: "Activity Data Quality",
              emissionFactorSource: "Emission Factor Source",
              emissionFactorDescription: "Emission Factor Description",
            };

            // Build detected columns list
            for (const header of headers) {
              if (!header) continue;

              // Find which GPC field this column maps to
              let interpretedAs: string | null = null;
              let status: "detected" | "manual" = "manual";

              for (const [key, index] of Object.entries(
                importedFile.validationResults.detectedColumns,
              )) {
                if (headers[Number(index)] === header) {
                  interpretedAs = gpcFieldNames[key] || key;
                  status = "detected";
                  break;
                }
              }

              // Get example value
              const exampleValue =
                firstRow[header]?.toString().substring(0, 50) || null;

              detectedColumnsList.push({
                columnName: header,
                interpretedAs,
                status,
                exampleValue,
              });
            }
          }
        } catch (error) {
          console.error("Failed to parse file for validation step:", error);
        }
      }

      validationStepData = {
        totalColumnsDetected: detectedColumnsList.length,
        columns: detectedColumnsList,
        errors: importedFile.validationResults?.errors || [],
        warnings: importedFile.validationResults?.warnings || [],
      };
    }

    // Step 3: Column Mapping - Get columns that need mapping
    let columnMappingStepData = null;
    if (currentStep >= 3 && importedFile.validationResults?.detectedColumns) {
      // For now, same as validation step, but this could include user-editable mappings
      columnMappingStepData = validationStepData;
    }

    // Step 4: Review and Confirm - Generate mapping preview and summary
    let reviewStepData = null;
    if (
      currentStep === 4 &&
      importedFile.importStatus === "waiting_for_approval" &&
      importedFile.data &&
      importedFile.validationResults?.detectedColumns
    ) {
      try {
        // Parse the file and create mapping preview
        const parsedData = await FileParserService.parseFile(
          importedFile.data,
          importedFile.fileType,
        );

        const mappingPreview = await ImportMappingService.createMappingPreview(
          inventory,
          parsedData,
          importedFile.validationResults.detectedColumns,
        );

        // Build field mappings summary
        const fieldMappings: Array<{
          sourceColumn: string;
          mappedField: string;
        }> = [];

        if (validationStepData?.columns) {
          for (const col of validationStepData.columns) {
            if (col.interpretedAs) {
              fieldMappings.push({
                sourceColumn: col.columnName,
                mappedField: col.interpretedAs,
              });
            }
          }
        }

        reviewStepData = {
          importSummary: {
            sourceFile: importedFile.originalFileName,
            formatDetected: importedFile.fileType.toUpperCase(),
            rowsFound: importedFile.rowCount || 0,
            fieldsMapped: fieldMappings.length,
          },
          fieldMappings,
          mappingPreview,
        };
      } catch (error) {
        console.error("Failed to generate review step data:", error);
      }
    }

    // Return response structured by step
    return NextResponse.json({
      data: {
        id: importedFile.id,
        importStatus: importedFile.importStatus,
        currentStep,
        // Step 1: Upload (basic file info)
        fileInfo: {
          fileName: importedFile.fileName,
          originalFileName: importedFile.originalFileName,
          fileType: importedFile.fileType,
          fileSize: importedFile.fileSize,
        },
        // Step 2: Validation Results
        validationResults: validationStepData,
        // Step 3: Column Mapping
        columnMappings: columnMappingStepData,
        // Step 4: Review and Confirm
        reviewData: reviewStepData,
        // Legacy fields (for backwards compatibility)
        rowCount: importedFile.rowCount,
        processedRowCount: importedFile.processedRowCount,
        validationResults_legacy: importedFile.validationResults,
        mappingConfiguration: importedFile.mappingConfiguration,
        errorLog: importedFile.errorLog,
        created: importedFile.created,
        lastUpdated: importedFile.lastUpdated,
        completedAt: importedFile.completedAt,
      },
    });
  },
);

