import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { POST as uploadImportFile } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/route";
import { GET as getImportStatus } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/route";
import { POST as extractImport } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/extract/route";
import { NextRequest } from "next/server";
import { POST as approveImport } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route";
import { POST as previewImportRows } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/row-preview/route";
import { PATCH as patchSourceChecks } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/source-checks/route";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ExtractionSummary } from "@/util/GHGI/extraction-summary";
import {
  applyReadings,
  optionTotals,
  unitGroupOptionTotals,
  type Readings,
  type SourceChecks,
} from "@/util/GHGI/source-checks";
import { db } from "@/models";
import assert from "node:assert";
import { AppSession, Auth } from "@/lib/auth";
import env from "@next/env";
import { Roles } from "@/util/types";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { randomUUID } from "node:crypto";
import { ImportStatusEnum } from "@/util/enums";
import {
  InventoryTypeEnum,
  GlobalWarmingPotentialTypeEnum,
} from "@/util/enums";
import { Sector } from "@/models/Sector";
import { SubSector } from "@/models/SubSector";
import { SubCategory } from "@/models/SubCategory";
import { Op } from "sequelize";
import Excel from "exceljs";
import { expectStatusCode, expectStatusCodes, mockRequest } from "../helpers";
import { Scope } from "@/models/init-models";

// Test helpers (avoiding helpers.ts due to import.meta.url ESM issue)
export const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";

/**
 * Helper function to create a valid XLSX file buffer for testing
 * @param options - Configuration for the mock file
 * @returns Buffer containing a valid XLSX file
 */
async function createMockXLSXFile(options?: {
  gpcRefNo?: string;
  activityAmount?: number;
  activityUnit?: string;
  totalCO2e?: number;
  dataSource?: string;
  dataQuality?: string;
}): Promise<Buffer> {
  const workbook = new Excel.Workbook();
  const worksheet = workbook.addWorksheet("eCRF_3");

  // Set up headers (required columns)
  const headers = [
    "GPC ref. no.",
    "CRF - Sector",
    "CRF - Sub-sector",
    "Scope",
    "Activity Amount",
    "Activity Unit",
    "Data source",
    "Data quality",
    "GHGs (metric tonnes CO2e) - Total CO2e",
  ];

  // Add headers row
  worksheet.addRow(headers);

  // Add data row
  worksheet.addRow([
    options?.gpcRefNo || "I.1.1",
    "Energy",
    "Stationary Combustion",
    "1",
    options?.activityAmount || 100,
    options?.activityUnit || "Liters (l)",
    options?.dataSource || "Test Data Source",
    options?.dataQuality || "High",
    options?.totalCO2e || 436.329,
  ]);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function setupTests() {
  const projectDir = process.cwd();
  // Load env config - this is essential for database connection
  // Use default import pattern that matches helpers.ts for CI compatibility
  try {
    env.loadEnvConfig(projectDir);
  } catch (error) {
    // If env loading fails, continue - might be already loaded
    console.warn("Could not load env config:", error);
  }

  // mock getServerSession from NextAuth
  jest.spyOn(Auth, "getServerSession").mockResolvedValue(
    (() => {
      const expires = new Date();
      expires.setDate(expires.getDate() + 1);
      return {
        user: {
          id: testUserID,
          name: "Test User",
          email: "test@example.com",
          image: null,
          role: Roles.User,
        },
        expires: expires.toISOString(),
      } as AppSession;
    })(),
  );
}

const testCityLocode = "XX_IMPORT_TEST";
const testCityName = "Import Test City";
const testCityCountry = "Test Country";
const testInventoryName = "XX_IMPORT_TEST_INVENTORY";

describe("Import Routes API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subsector: SubSector;
  let subcategory: SubCategory;
  let subsectorScope: Scope;
  let subcategoryScope: Scope;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Cleanup existing test data
    // Note: ImportedInventoryFile cleanup will be done in beforeEach/afterAll
    await db.models.Inventory.destroy({
      where: { inventoryName: testInventoryName },
    });
    await db.models.City.destroy({ where: { locode: testCityLocode } });
    await db.models.SubCategory.destroy({
      where: { subcategoryName: { [Op.like]: "XX_IMPORT_TEST%" } },
    });
    await db.models.SubSector.destroy({
      where: { subsectorName: { [Op.like]: "XX_IMPORT_TEST%" } },
    });
    await db.models.Sector.destroy({
      where: { sectorName: { [Op.like]: "XX_IMPORT_TEST%" } },
    });

    // Create test user
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });

    // Create test city
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: testCityName,
      country: testCityCountry,
      locode: testCityLocode,
    });
    await city.addUser(testUserID);

    // Create test inventory
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: testInventoryName,
      year: 2023,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    // Create test sector/subsector/subcategory for GPC references
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName: "XX_IMPORT_TEST_SECTOR",
    });

    // Create scopes for subsector and subcategory (required for foreign keys)
    subsectorScope = await db.models.Scope.create({
      scopeId: randomUUID(),
      scopeName: "1",
    });

    subcategoryScope = await db.models.Scope.create({
      scopeId: randomUUID(),
      scopeName: "1",
    });

    subsector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: "XX_IMPORT_TEST_SUBSECTOR",
      scopeId: subsectorScope.scopeId,
    });

    subcategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subsector.subsectorId,
      subcategoryName: "XX_IMPORT_TEST_SUBCATEGORY",
      referenceNumber: "I.1.1",
      scopeId: subcategoryScope.scopeId,
    });
  });

  beforeEach(async () => {
    // Clean up imported files before each test
    // Only clean up if inventory was successfully created
    if (inventory?.inventoryId) {
      await db.models.ImportedInventoryFile.destroy({
        where: {
          inventoryId: inventory.inventoryId,
        },
        force: true,
      });
    }
  });

  afterAll(async () => {
    // Only clean up if inventory was successfully created
    if (inventory?.inventoryId) {
      await db.models.ImportedInventoryFile.destroy({
        where: {
          inventoryId: inventory.inventoryId,
        },
        force: true,
      });
    }
    if (subcategory?.subcategoryId) {
      await db.models.SubCategory.destroy({
        where: { subcategoryId: subcategory.subcategoryId },
      });
    }
    if (subsector?.subsectorId) {
      await db.models.SubSector.destroy({
        where: { subsectorId: subsector.subsectorId },
      });
    }
    if (sector?.sectorId) {
      await db.models.Sector.destroy({ where: { sectorId: sector.sectorId } });
    }
    if (inventory?.inventoryId) {
      await db.models.Inventory.destroy({
        where: { inventoryId: inventory.inventoryId },
      });
    }
    if (city?.cityId) {
      await db.models.City.destroy({ where: { cityId: city.cityId } });
    }
    if (subcategoryScope?.scopeId) {
      await db.models.Scope.destroy({
        where: { scopeId: subcategoryScope.scopeId },
      });
    }
    if (subsectorScope?.scopeId) {
      await db.models.Scope.destroy({
        where: { scopeId: subsectorScope.scopeId },
      });
    }
    // Close database connection to prevent hanging async operations in CI
    if (db.sequelize) {
      await db.sequelize.close();
      // Give sequelize a moment to fully close all connections
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  describe("POST /api/v1/city/[city]/inventory/[inventory]/import", () => {
    it("should reject request without file", async () => {
      const formData = new FormData();
      // No file appended

      const req = mockRequest();
      req.formData = jest.fn(() => Promise.resolve(formData));

      const res = await uploadImportFile(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
        }),
      });

      await expectStatusCode(res, 400);
    });

    it("should reject request with invalid city ID", async () => {
      const fileContent = await createMockXLSXFile();
      const mockFile = {
        name: "test.xlsx",
        size: fileContent.length,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        arrayBuffer: async () => fileContent.buffer,
      } as unknown as File;

      const formData = new FormData();
      formData.append("file", mockFile);

      const req = mockRequest();
      req.formData = jest.fn(() => Promise.resolve(formData));

      try {
        await uploadImportFile(req, {
          params: Promise.resolve({
            city: "invalid-uuid",
            inventory: inventory.inventoryId,
          }),
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error);
      }
    });

    it("should reject request with invalid inventory ID", async () => {
      const fileContent = await createMockXLSXFile();
      const mockFile = {
        name: "test.xlsx",
        size: fileContent.length,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        arrayBuffer: async () => fileContent.buffer,
      } as unknown as File;

      const formData = new FormData();
      formData.append("file", mockFile);

      const req = mockRequest();
      req.formData = jest.fn(() => Promise.resolve(formData));

      try {
        await uploadImportFile(req, {
          params: Promise.resolve({
            city: city.cityId,
            inventory: "invalid-uuid",
          }),
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe("GET /api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]", () => {
    it("should return step 1 data for uploaded file", async () => {
      // Create an imported file with uploaded status
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.UPLOADED,
        data: fileContent,
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.ok(json.data);
      assert.equal(json.data.currentStep, 1);
      assert.ok(json.data.fileInfo);
      assert.equal(json.data.fileInfo.fileName, "test-file.xlsx");
      assert.ok(json.data.importStatus);
    });

    it("should return step 2 data for processing file with validation results", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.PROCESSING,
        data: fileContent,
        validationResults: {
          detectedColumns: {
            gpcRefNo: 0,
            activityAmount: 4,
          },
          errors: [],
          warnings: [],
        },
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.ok(json.data);
      assert.equal(json.data.currentStep, 2);
      assert.ok(json.data.validationResults);
      assert.ok(json.data.validationResults.columns);
      assert.ok(Array.isArray(json.data.validationResults.columns));
    });

    it("should return step 3 data for waiting_for_approval file without mappings", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: {
            gpcRefNo: 0,
            activityAmount: 4,
          },
          errors: [],
          warnings: [],
        },
        mappingConfiguration: {
          rows: [],
        },
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.ok(json.data);
      assert.equal(json.data.currentStep, 3);
      assert.ok(json.data.columnMappings);
    });

    it("should return step 4 data for waiting_for_approval file with mappings", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: {
            gpcRefNo: 0,
            activityAmount: 4,
          },
          errors: [],
          warnings: [],
        },
        mappingConfiguration: {
          rows: [
            {
              gpcRefNo: "I.1.1",
              sectorId: sector.sectorId,
              subsectorId: subsector.subsectorId,
              subcategoryId: subcategory.subcategoryId,
              scopeId: subcategory.scopeId!,
            },
          ],
          mappingsApplied: true,
        },
        rowCount: 1,
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.ok(json.data);
      assert.equal(json.data.currentStep, 4);
      assert.ok(json.data.reviewData);
      assert.ok(json.data.reviewData.importSummary);
      assert.ok(json.data.reviewData.fieldMappings);
    });

    it("should list rows outside GPC BASIC while waiting for approval", async () => {
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.pdf",
        fileType: "pdf",
        fileSize: 1,
        originalFileName: "test-file.pdf",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        validationResults: { errors: [], warnings: [] },
        mappingConfiguration: {
          rows: [
            { gpcRefNo: "I.1.1", totalCO2e: 10 },
            { gpcRefNo: "I.1.3", totalCO2e: 10 },
            { gpcRefNo: "I.2.3", totalCO2e: 0 },
            { gpcRefNo: "IV.1", totalCO2e: 10 },
            { gpcRefNo: null, totalCO2e: 10 },
          ],
        },
        rowCount: 5,
      });

      const res = await getImportStatus(mockRequest(), {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.deepEqual(json.data.rowsOutsideInventoryType, ["I.1.3", "IV.1"]);
    });

    it("should return 404 for non-existent imported file", async () => {
      const req = mockRequest();
      const fakeId = randomUUID();

      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: fakeId,
        }),
      });

      await expectStatusCode(res, 404);
    });

    it("should return 404 for imported file from different user", async () => {
      const otherUserId = randomUUID();
      await db.models.User.upsert({
        userId: otherUserId,
        name: "OTHER_USER",
      });

      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: otherUserId, // Different user
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.UPLOADED,
        data: fileContent,
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 404);
    });

    it("should return inferredYearFromFile in data when present on validationResults", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: {
            gpcRefNo: 0,
            activityAmount: 4,
          },
          errors: [],
          warnings: [],
          inferredYearFromFile: 2021,
        },
        mappingConfiguration: {
          rows: [],
        },
      });

      const req = mockRequest();
      const res = await getImportStatus(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId: importedFile.id,
        }),
      });

      await expectStatusCode(res, 200);
      const json = await res.json();
      assert.strictEqual(json.data.inferredYearFromFile, 2021);
    });
  });

  describe("POST /api/v1/city/[city]/inventory/[inventory]/import/approve", () => {
    it("should approve import and update status to approved", async () => {
      // Create an imported file ready for approval
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: {
            gpcRefNo: 0,
            activityAmount: 4,
          },
          errors: [],
          warnings: [],
        },
        mappingConfiguration: {
          rows: [],
        },
      });

      const req = mockRequest({
        importedFileId: importedFile.id,
        mappingOverrides: {},
      });

      // Note: In a real test environment, you would mock these services
      // For now, we'll let the test run and handle failures gracefully
      // The services may fail but we can test the approval workflow

      const res = await approveImport(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
        }),
      });

      // Approve returns 202 Accepted when import is started in background; client polls for completion.
      // The import process may fail in tests due to incomplete file data, but we verify the approval step.
      await expectStatusCodes(res, [200, 202, 500]);

      // Reload to check status - should have moved from WAITING_FOR_APPROVAL
      await importedFile.reload();
      assert.ok(
        [
          ImportStatusEnum.APPROVED,
          ImportStatusEnum.IMPORTING,
          ImportStatusEnum.COMPLETED,
          ImportStatusEnum.FAILED,
        ].includes(importedFile.importStatus),
      );
      assert.notEqual(
        importedFile.importStatus,
        ImportStatusEnum.WAITING_FOR_APPROVAL,
      );
    });

    it("should reject approval for file not in waiting_for_approval status", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.UPLOADED, // Wrong status
        data: fileContent,
      });

      const req = mockRequest({
        importedFileId: importedFile.id,
      });

      const res = await approveImport(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
        }),
      });

      await expectStatusCode(res, 400);
    });

    it("should reject approval with invalid importedFileId", async () => {
      const req = mockRequest({
        importedFileId: "invalid-uuid",
      });

      try {
        await approveImport(req, {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventory.inventoryId,
          }),
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(error);
      }
    });

    it("should reject approval for non-existent file", async () => {
      const req = mockRequest({
        importedFileId: randomUUID(),
      });

      const res = await approveImport(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
        }),
      });

      await expectStatusCode(res, 404);
    });

    it("should accept mappingOverrides in request body", async () => {
      const fileContent = await createMockXLSXFile();
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: {},
          errors: [],
          warnings: [],
        },
        mappingConfiguration: {
          rows: [],
        },
      });

      const mappingOverrides = {
        "row-1": {
          gpcRefNo: "I.1.2",
        },
      };

      const req = mockRequest({
        importedFileId: importedFile.id,
        mappingOverrides,
      });

      // Note: In a real test environment, you would mock these services
      // For now, we'll let the test run and handle failures gracefully

      await approveImport(req, {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
        }),
      });

      // Verify mapping overrides were stored
      await importedFile.reload();
      const config = importedFile.mappingConfiguration;
      expect(config?.overrides).toBeTruthy();
    });

    describe("when the inventory already has data", () => {
      let filledInventory: Inventory;

      beforeEach(async () => {
        filledInventory = await db.models.Inventory.create({
          inventoryId: randomUUID(),
          cityId: city.cityId,
          inventoryName: testInventoryName,
          year: 2021,
          totalEmissions: 0,
          inventoryType: InventoryTypeEnum.GPC_BASIC,
          globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        });
        await db.models.InventoryValue.create({
          id: randomUUID(),
          inventoryId: filledInventory.inventoryId,
          gpcReferenceNumber: "I.1.1",
          sectorId: sector.sectorId,
          subSectorId: subsector.subsectorId,
          subCategoryId: subcategory.subcategoryId,
          unavailableReason: "no-occurrance",
          unavailableExplanation: "Does not occur",
        });
      });

      afterEach(async () => {
        await db.models.ImportedInventoryFile.destroy({
          where: { inventoryId: filledInventory.inventoryId },
          force: true,
        });
        await db.models.InventoryValue.destroy({
          where: { inventoryId: filledInventory.inventoryId },
        });
        await db.models.Version.destroy({
          where: { inventoryId: filledInventory.inventoryId },
        });
        await db.models.Inventory.destroy({
          where: { inventoryId: filledInventory.inventoryId },
        });
      });

      async function createFileWaitingForApproval() {
        const fileContent = await createMockXLSXFile();
        return db.models.ImportedInventoryFile.create({
          id: randomUUID(),
          userId: testUserID,
          cityId: city.cityId,
          inventoryId: filledInventory.inventoryId,
          fileName: "test-file.xlsx",
          fileType: "xlsx",
          fileSize: fileContent.length,
          originalFileName: "test-file.xlsx",
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          data: fileContent,
          validationResults: { errors: [], warnings: [] },
          mappingConfiguration: { rows: [] },
        });
      }

      it("should return 409 inventory-has-data without replaceExisting", async () => {
        const importedFile = await createFileWaitingForApproval();

        const res = await approveImport(
          mockRequest({ importedFileId: importedFile.id }),
          {
            params: Promise.resolve({
              city: city.cityId,
              inventory: filledInventory.inventoryId,
            }),
          },
        );

        await expectStatusCode(res, 409);
        const json = await res.json();
        expect(json.error.code).toBe("inventory-has-data");
        expect(json.error.data).toEqual({ existingValueCount: 1 });

        // nothing was started or removed
        await importedFile.reload();
        expect(importedFile.importStatus).toBe(
          ImportStatusEnum.WAITING_FOR_APPROVAL,
        );
        expect(
          await db.models.InventoryValue.count({
            where: { inventoryId: filledInventory.inventoryId },
          }),
        ).toBe(1);
      });

      it("should keep the existing data when a confirmed replace imports no rows", async () => {
        const importedFile = await createFileWaitingForApproval();

        const res = await approveImport(
          mockRequest({
            importedFileId: importedFile.id,
            replaceExisting: true,
          }),
          {
            params: Promise.resolve({
              city: city.cityId,
              inventory: filledInventory.inventoryId,
            }),
          },
        );

        await expectStatusCode(res, 202);

        // the file maps no rows, so the background import fails and rolls back the replace
        for (let attempt = 0; attempt < 50; attempt++) {
          await importedFile.reload();
          if (
            importedFile.importStatus === ImportStatusEnum.COMPLETED ||
            importedFile.importStatus === ImportStatusEnum.FAILED
          ) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(importedFile.importStatus).toBe(ImportStatusEnum.FAILED);
        expect(
          await db.models.InventoryValue.count({
            where: { inventoryId: filledInventory.inventoryId },
          }),
        ).toBe(1);
        expect(
          await db.models.Version.count({
            where: { inventoryId: filledInventory.inventoryId },
          }),
        ).toBe(0);
      });
    });

    describe("when a PDF row's value is not confirmed on its page", () => {
      let pdfInventory: Inventory;

      beforeEach(async () => {
        pdfInventory = await db.models.Inventory.create({
          inventoryId: randomUUID(),
          cityId: city.cityId,
          inventoryName: testInventoryName,
          year: 2022,
          totalEmissions: 0,
          inventoryType: InventoryTypeEnum.GPC_BASIC,
          globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        });
      });

      afterEach(async () => {
        const where = { inventoryId: pdfInventory.inventoryId };
        await db.models.ImportedInventoryFile.destroy({ where, force: true });
        await db.models.InventoryValue.destroy({ where });
        await db.models.Version.destroy({ where });
        await db.models.Inventory.destroy({ where });
      });

      const params = () => ({
        params: Promise.resolve({
          city: city.cityId,
          inventory: pdfInventory.inventoryId,
        }),
      });

      it("holds approval until the row is kept", async () => {
        const importedFile = await db.models.ImportedInventoryFile.create({
          id: randomUUID(),
          userId: testUserID,
          cityId: city.cityId,
          inventoryId: pdfInventory.inventoryId,
          fileName: "report.pdf",
          fileType: "pdf",
          fileSize: 1,
          originalFileName: "report.pdf",
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          data: Buffer.from("%PDF"),
          validationResults: { errors: [], warnings: [] },
          mappingConfiguration: {
            rows: [
              {
                year: 2022,
                sector: "Stationary Energy",
                subsector: "Residential buildings",
                category: null,
                scope: "1",
                totalCO2e: 436.329,
                gpcRefNo: "I.1.1",
                refSource: "document",
                page: 3,
                valueCheck: "not_found",
              },
            ],
          },
        });

        const held = await approveImport(
          mockRequest({ importedFileId: importedFile.id }),
          params(),
        );
        await expectStatusCode(held, 409);
        expect((await held.json()).error.code).toBe("import-rows-pending");

        const previewRes = await previewImportRows(mockRequest({}), {
          params: Promise.resolve({
            city: city.cityId,
            inventory: pdfInventory.inventoryId,
            importedFileId: importedFile.id,
          }),
        });
        await expectStatusCode(previewRes, 200);
        const [row] = (await previewRes.json()).data.reviewRows;
        expect(row).toMatchObject({
          issue: "value-unconfirmed",
          page: 3,
          value: 436.329,
        });

        const kept = await approveImport(
          mockRequest({
            importedFileId: importedFile.id,
            mappingOverrides: {
              rowDecisions: {
                [row.rowIndex]: {
                  decisionFileId: importedFile.id,
                  decisionToken: row.decisionToken,
                  decisionRef: row.suggestedRefNo,
                  decisionScope: row.scope,
                  decisionValue: row.value,
                  reviewDecision: "keep",
                },
              },
            },
          }),
          params(),
        );
        await expectStatusCode(kept, 202);

        // Let the background import settle before cleanup.
        for (let attempt = 0; attempt < 50; attempt++) {
          await importedFile.reload();
          if (
            importedFile.importStatus === ImportStatusEnum.COMPLETED ||
            importedFile.importStatus === ImportStatusEnum.FAILED
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(importedFile.importStatus).toBe(ImportStatusEnum.COMPLETED);
        const values = await db.models.InventoryValue.findAll({
          where: { inventoryId: pdfInventory.inventoryId },
        });
        expect(values).toHaveLength(1);
        expect(values[0].gpcReferenceNumber).toBe("I.1.1");
        // co2eq is stored in kilograms: the kept 436.329 t, unscaled.
        expect(values[0].co2eq?.toString()).toBe("436329");
      });
    });
  });

  describe("POST /api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/extract", () => {
    const legacyMetadata = {
      numberFormat: "european",
      numberFormatSource: "user",
      reportedTotal: 9559215,
      reportedTotalKind: "gross",
    };

    const createPdf = (mappingConfiguration?: Record<string, unknown>) =>
      db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "plan.pdf",
        fileType: "pdf",
        fileSize: 10,
        originalFileName: "plan.pdf",
        importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
        s3Key: "test/plan.pdf",
        mappingConfiguration,
      });

    const postExtract = (importedFileId: string, body?: unknown) =>
      extractImport(
        new NextRequest("http://localhost:3000/api/extract", {
          method: "POST",
          headers:
            body === undefined ? {} : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventory.inventoryId,
            importedFileId,
          }),
        },
      );

    afterEach(async () => {
      await db.models.PdfOcrJob.destroy({
        where: { sourceType: "inventory_import" },
      });
    });

    it("extract without body works and stores no sourceMetadata", async () => {
      const file = await createPdf();
      const res = await postExtract(file.id);
      await expectStatusCode(res, 202);
      await file.reload();
      expect(file.mappingConfiguration?.sourceMetadata).toBeUndefined();
    });

    it("extract ignores a body and stores no sourceMetadata", async () => {
      const file = await createPdf();
      const res = await postExtract(file.id, {
        sourceMetadata: legacyMetadata,
      });
      await expectStatusCode(res, 202);
      await file.reload();
      expect(file.mappingConfiguration?.sourceMetadata).toBeUndefined();
    });

    it("extract ignores an invalid body instead of rejecting it", async () => {
      const file = await createPdf();
      const res = await postExtract(file.id, {
        sourceMetadata: { numberFormat: "european" },
      });
      await expectStatusCode(res, 202);
      await file.reload();
      expect(file.mappingConfiguration?.sourceMetadata).toBeUndefined();
    });

    it.each<[string, unknown]>([
      ["no body", undefined],
      ["a body", { sourceMetadata: legacyMetadata }],
    ])(
      "re-extract with %s clears stale sourceMetadata and keeps extractionProgress",
      async (_label, body) => {
        const file = await createPdf({
          extractionProgress: { current: 2, total: 5 },
          sourceMetadata: legacyMetadata,
        });
        const res = await postExtract(file.id, body);
        await expectStatusCode(res, 202);
        await file.reload();
        expect(file.mappingConfiguration?.sourceMetadata).toBeUndefined();
        expect(file.mappingConfiguration?.extractionProgress).toEqual({
          current: 2,
          total: 5,
        });
      },
    );
  });
  describe("source-checks", () => {
    const candidates = [
      {
        label: "Total BASIC",
        value: 5,
        year: 2023,
        scope: null,
        sector: null,
        subsector: null,
        level: "total" as const,
        unitCheck: "MT" as const,
        source: "Table 3",
        page: 12,
      },
      {
        label: "Grand total",
        value: 105,
        year: 2023,
        scope: null,
        sector: null,
        subsector: null,
        level: "total" as const,
        source: "Table 4",
        page: 13,
      },
    ];

    const row = (
      gpcRefNo: string,
      totalCO2e: number,
      extra: Record<string, unknown> = {},
    ) => ({
      year: 2023,
      sector: "Stationary Energy",
      subsector: "Residential buildings",
      scope: "1",
      category: null,
      totalCO2e,
      gpcRefNo,
      ...extra,
    });

    const storedRows = [
      row("I.1.1", 2, { co2: 1, ch4: 0.5, n2o: 0.5, unitCheck: "MT" }),
      row("I.2.1", 3, { unitCheck: "MT" }),
      row("II.1.1", 100),
    ] as ExtractedRow[];

    const sourceChecks = (overrides: Partial<SourceChecks> = {}) =>
      ({
        unit: {
          status: "pending",
          reading: "t",
          evidence: {
            unitText: "MT CO2e",
            sources: ["Table 3"],
            pages: [12],
            example: null,
          },
        },
        total: {
          status: "pending",
          candidates,
          selected: null,
          suggested: 0,
        },
        ...overrides,
      }) as SourceChecks;

    const createChecked = (
      options: {
        status?: ImportStatusEnum;
        userId?: string;
        checks?: SourceChecks | undefined;
        overrides?: Record<string, unknown>;
        rows?: ExtractedRow[];
      } = {},
    ) =>
      db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: options.userId ?? testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "plan.pdf",
        fileType: "pdf",
        fileSize: 10,
        originalFileName: "plan.pdf",
        importStatus: options.status ?? ImportStatusEnum.WAITING_FOR_APPROVAL,
        mappingConfiguration: {
          rows: options.rows ?? storedRows,
          extractionSummary: {
            reportedTotals: candidates,
            droppedRows: {},
            importedSum: 105,
            yearAssumed: false,
            sourceChecks: "checks" in options ? options.checks : sourceChecks(),
          },
          ...(options.overrides ? { overrides: options.overrides } : {}),
        },
      });

    const T_NONE = { units: { doc: "t" }, numberFormat: null } as const;
    /** Answers with `expected` (the readings the card showed); false sends none. */
    const patch = (
      importedFileId: string,
      body: Record<string, unknown>,
      expected: Readings | false = T_NONE,
    ) =>
      patchSourceChecks(mockRequest(expected ? { ...body, expected } : body), {
        params: Promise.resolve({
          city: city.cityId,
          inventory: inventory.inventoryId,
          importedFileId,
        }),
      });

    const storedSummary = async (file: { reload: () => Promise<unknown> }) => {
      await file.reload();
      return (
        file as unknown as {
          mappingConfiguration: {
            rows: ExtractedRow[];
            extractionSummary: ExtractionSummary;
            overrides?: Record<string, unknown>;
          };
        }
      ).mappingConfiguration;
    };

    const decision = (value: number, ref: string) => ({
      reviewDecision: "keep",
      decisionFileId: "file",
      decisionToken: "token",
      decisionRef: ref,
      decisionScope: "1",
      decisionValue: value,
    });

    it("applies unit reading", async () => {
      const file = await createChecked();
      const res = await patch(file.id, { units: { doc: "Mt" } });
      await expectStatusCode(res, 200);
      const json = await res.json();

      const stored = await storedSummary(file);
      expect(stored.rows[0]).toMatchObject({
        totalCO2e: 2_000_000,
        co2: 1_000_000,
        ch4: 500_000,
        n2o: 500_000,
      });
      expect(stored.rows[1].totalCO2e).toBe(3_000_000);
      expect(stored.rows[2].totalCO2e).toBe(100);

      const optionTotal = optionTotals(
        storedRows,
        { units: { doc: "t" }, numberFormat: null },
        { unitGroup: "doc" },
      ).find((option) => option.reading === "Mt")?.total;
      expect(stored.extractionSummary.importedSum).toBe(optionTotal);
      expect(stored.extractionSummary.importedSum).toBe(5_000_100);
      expect(stored.extractionSummary.sourceChecks?.unit).toMatchObject({
        status: "confirmed",
        reading: "Mt",
      });
      expect(stored.extractionSummary.reportedTotals[0].value).toBe(5_000_000);
      expect(
        stored.extractionSummary.sourceChecks?.total?.candidates[0].value,
      ).toBe(5_000_000);
      expect(stored.extractionSummary.sourceChecks?.total?.status).toBe(
        "pending",
      );
      expect(json.data.extractionSummary).toEqual(stored.extractionSummary);
    });

    it("confirm same reading", async () => {
      const file = await createChecked();
      const res = await patch(file.id, { units: { doc: "t" } });
      await expectStatusCode(res, 200);
      const stored = await storedSummary(file);
      expect(stored.rows).toEqual(storedRows);
      expect(stored.extractionSummary.importedSum).toBe(105);
      expect(stored.extractionSummary.sourceChecks?.unit).toMatchObject({
        status: "confirmed",
        reading: "t",
      });
    });

    it("confirms printed total", async () => {
      const file = await createChecked();
      const res = await patch(file.id, { total: { candidate: 0 } });
      await expectStatusCode(res, 200);
      const stored = await storedSummary(file);
      expect(stored.extractionSummary.sourceChecks?.total).toMatchObject({
        status: "confirmed",
        selected: {
          value: 5,
          origin: "document",
          label: "Total BASIC",
          source: "Table 3",
          page: 12,
        },
      });
      expect(stored.extractionSummary.sourceChecks?.unit?.status).toBe(
        "pending",
      );
    });

    it("keeps a confirmed printed total in the new unit reading", async () => {
      const file = await createChecked({
        checks: sourceChecks({
          total: {
            status: "confirmed",
            candidates,
            selected: {
              value: 5,
              origin: "document",
              label: "Total BASIC",
              source: "Table 3",
              page: 12,
            },
            suggested: 0,
          },
        }),
      });
      const res = await patch(file.id, { units: { doc: "Mt" } });
      await expectStatusCode(res, 200);
      const stored = await storedSummary(file);
      expect(stored.extractionSummary.sourceChecks?.total?.selected).toEqual({
        value: 5_000_000,
        origin: "document",
        label: "Total BASIC",
        source: "Table 3",
        page: 12,
      });
    });

    it("typed total is no-source", async () => {
      const file = await createChecked();
      const typed = await patch(file.id, { total: { value: 412300 } });
      await expectStatusCode(typed, 200);
      const stored = await storedSummary(file);
      expect(stored.extractionSummary.sourceChecks?.total).toMatchObject({
        status: "confirmed",
        selected: { value: 412300, origin: "user" },
      });

      await expectStatusCode(
        await patch(file.id, { total: { candidate: 2 } }),
        400,
      );
      await expectStatusCode(
        await patch(file.id, { total: { skip: true } }),
        400,
      );
      await expectStatusCode(
        await patch(file.id, { total: { value: 0 } }),
        400,
      );

      const empty = await createChecked({
        checks: sourceChecks({
          total: {
            status: "pending",
            candidates: [],
            selected: null,
            suggested: null,
          },
        }),
      });
      const skipped = await patch(empty.id, { total: { skip: true } });
      await expectStatusCode(skipped, 200);
      const emptyStored = await storedSummary(empty);
      expect(emptyStored.extractionSummary.sourceChecks?.total).toMatchObject({
        status: "confirmed",
        selected: null,
      });
    });

    it("rejects an answer to a check the import does not have", async () => {
      const file = await createChecked();
      await expectStatusCode(
        await patch(file.id, { numberFormat: "european" }),
        400,
      );
      await expectStatusCode(await patch(file.id, {}), 400);
      const unchecked = await createChecked({ checks: undefined });
      await expectStatusCode(
        await patch(unchecked.id, { units: { doc: "t" } }),
        400,
      );
    });

    describe("unit groups (rows without a printed unit)", () => {
      const groupRows = [
        row("I.1.1", 1.5, { unitCheck: "missing", page: 12, co2: 1.5 }),
        row("I.2.1", 2, { unitCheck: "missing", page: 12 }),
        row("I.3.1", 3.25, { unitCheck: "missing", page: 12 }),
        row("II.1.1", 10, { unitCheck: "missing", page: 14 }),
        row("II.2.1", 100, { page: 12 }),
      ] as ExtractedRow[];
      const group = (key: string, page: number, rowCount: number) => ({
        key,
        page,
        tableId: null,
        rowCount,
        preselected: key === "p12" ? ("kt" as const) : ("t" as const),
        options: ["t" as const, "kt" as const, "Mt" as const],
        status: "pending" as const,
        reading: null,
      });
      const groupChecks = () =>
        ({
          unitGroups: [group("p12", 12, 3), group("p14", 14, 1)],
          total: {
            status: "pending",
            candidates,
            selected: null,
            suggested: 0,
          },
        }) as SourceChecks;
      // No group answered yet: no group key in the readings.
      const T_GROUPS: Readings = { units: {}, numberFormat: null };
      const createGrouped = () =>
        createChecked({ rows: groupRows, checks: groupChecks() });

      it("PATCH with units {p12:'kt'} stores importedSum equal to the kt option total", async () => {
        const file = await createGrouped();
        const res = await patch(file.id, { units: { p12: "kt" } }, T_GROUPS);
        await expectStatusCode(res, 200);

        const stored = await storedSummary(file);
        const ktTotal = optionTotals(groupRows, T_GROUPS, {
          unitGroup: "p12",
        }).find((option) => option.reading === "kt")?.total;
        expect(stored.extractionSummary.importedSum).toBe(ktTotal);
        expect(stored.extractionSummary.importedSum).toBe(6750 + 10 + 100);
        expect(stored.rows.map((r) => r.totalCO2e)).toEqual([
          1500, 2000, 3250, 10, 100,
        ]);
        expect(stored.rows[0].co2).toBe(1500);
        expect(stored.extractionSummary.sourceChecks?.unitGroups).toEqual([
          { ...group("p12", 12, 3), status: "confirmed", reading: "kt" },
          group("p14", 14, 1),
        ]);

        // The next answer is computed under the confirmed group reading.
        const stale = await patch(file.id, { units: { p14: "kt" } }, T_GROUPS);
        await expectStatusCode(stale, 409);
        expect((await stale.json()).error.code).toBe("source-checks-conflict");
        const next = await patch(
          file.id,
          { units: { p12: "Mt" } },
          { units: { p12: "kt" }, numberFormat: null },
        );
        await expectStatusCode(next, 200);
        const again = await storedSummary(file);
        expect(again.rows[0].totalCO2e).toBe(1_500_000);
        expect(again.extractionSummary.importedSum).toBe(
          optionTotals(groupRows, T_GROUPS, { unitGroup: "p12" }).find(
            (option) => option.reading === "Mt",
          )?.total,
        );
      });

      it("each option total equals the stored importedSum for that answer exactly", async () => {
        // 696.234837 * 1000 = 696234.8369999999; converting that again
        // (x 1000 / 1000) gives 696234.837, so a second conversion drifts.
        const driftRows = [
          row("I.1.1", 1.5, { unitCheck: "missing", page: 12 }),
          row("II.1.1", 696.234837, { unitCheck: "missing", page: 14 }),
        ] as ExtractedRow[];
        const twice = (696.234837 * 1000 * 1000) / 1000;
        expect(twice).not.toBe(696.234837 * 1000);
        const selected = { p12: "kt", p14: "kt" } as const;
        for (const reading of ["t", "kt", "Mt"] as const) {
          const file = await createChecked({
            rows: driftRows,
            checks: {
              unitGroups: [group("p12", 12, 1), group("p14", 14, 1)],
            } as SourceChecks,
          });
          const shown = unitGroupOptionTotals(
            driftRows,
            T_GROUPS,
            selected,
            "p12",
          ).find((option) => option.reading === reading)?.total;
          await expectStatusCode(
            await patch(
              file.id,
              { units: { ...selected, p12: reading } },
              T_GROUPS,
            ),
            200,
          );
          const stored = await storedSummary(file);
          expect(stored.extractionSummary.importedSum).toBe(shown);
          // Converting to the other groups first, then per option, drifts.
          const others: Readings = { units: { p14: "kt" }, numberFormat: null };
          const twoStep = optionTotals(
            applyReadings(driftRows, T_GROUPS, others),
            others,
            { unitGroup: "p12" },
          ).find((option) => option.reading === reading)?.total;
          expect(twoStep).not.toBe(stored.extractionSummary.importedSum);
        }
      });

      it("a kt answer leaves a row the model already scaled unchanged", async () => {
        // Printed "1,234" on a kt page; the model returned 1,234,000 t.
        const scaledRows = [
          row("I.1.1", 1_234_000, {
            unitCheck: "missing",
            page: 12,
            totalCO2eText: "1,234",
            printedFactor: 1000,
          }),
          row("I.2.1", 5, {
            unitCheck: "missing",
            page: 12,
            totalCO2eText: "5",
            printedFactor: 1,
          }),
        ] as ExtractedRow[];
        const file = await createChecked({
          rows: scaledRows,
          checks: {
            unitGroups: [{ ...group("p12", 12, 2), preselected: "t" }],
          } as SourceChecks,
        });
        await expectStatusCode(
          await patch(file.id, { units: { p12: "kt" } }, T_GROUPS),
          200,
        );
        const stored = await storedSummary(file);
        expect(stored.rows.map((r) => r.totalCO2e)).toEqual([1_234_000, 5000]);
        const ktTotal = optionTotals(scaledRows, T_GROUPS, {
          unitGroup: "p12",
        }).find((option) => option.reading === "kt")?.total;
        expect(stored.extractionSummary.importedSum).toBe(ktTotal);
        expect(stored.extractionSummary.importedSum).toBe(1_239_000);
      });

      const rowPreview = async (importedFileId: string) => {
        const res = await previewImportRows(mockRequest({}), {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventory.inventoryId,
            importedFileId,
          }),
        });
        await expectStatusCode(res, 200);
        return (await res.json()).data as {
          pendingRows: number;
          reviewRows: { rowIndex: number; issue: string }[];
        };
      };

      it("rows of a unit group ask no row-level unit decision, pending or answered", async () => {
        const file = await createGrouped();
        const before = await rowPreview(file.id);
        expect(before.reviewRows).toEqual([]);
        expect(before.pendingRows).toBe(0);

        await expectStatusCode(
          await patch(file.id, { units: { p12: "kt", p14: "t" } }, T_GROUPS),
          200,
        );
        const after = await rowPreview(file.id);
        expect(after.reviewRows).toEqual([]);
        expect(after.pendingRows).toBe(0);
      });

      it("an unconfirmed value in a unit group stays a row-level decision", async () => {
        const rows = groupRows.map((r, i) =>
          i === 0 ? { ...r, valueCheck: "not_found" as const } : r,
        );
        const file = await createChecked({ rows, checks: groupChecks() });
        const preview = await rowPreview(file.id);
        expect(preview.reviewRows).toMatchObject([
          { rowIndex: 0, issue: "value-unconfirmed" },
        ]);
      });

      it("keeps the row-level unit decision without a group, or on a kg-only page", async () => {
        // A summary stored before unit groups: rows ask keep or skip.
        const legacy = await createChecked({
          rows: groupRows,
          checks: { total: groupChecks().total } as SourceChecks,
        });
        const legacyPreview = await rowPreview(legacy.id);
        expect(legacyPreview.reviewRows.map((r) => r.issue)).toEqual([
          "unit-unconfirmed",
          "unit-unconfirmed",
          "unit-unconfirmed",
          "unit-unconfirmed",
        ]);

        // No reading fits kg, so those rows keep keep/skip.
        const kg = await createChecked({
          rows: groupRows,
          checks: {
            unitGroups: [
              { ...group("p12", 12, 3), kgOnly: true },
              group("p14", 14, 1),
            ],
          } as SourceChecks,
        });
        const kgPreview = await rowPreview(kg.id);
        expect(kgPreview.reviewRows.map((r) => [r.rowIndex, r.issue])).toEqual([
          [0, "unit-unconfirmed"],
          [1, "unit-unconfirmed"],
          [2, "unit-unconfirmed"],
        ]);
      });

      it("rejects an unknown group key with 400", async () => {
        const file = await createGrouped();
        await expectStatusCode(
          await patch(file.id, { units: { p99: "kt" } }, T_GROUPS),
          400,
        );
        // No MT check on this import: no doc reading to answer.
        await expectStatusCode(
          await patch(file.id, { units: { doc: "Mt" } }, T_GROUPS),
          400,
        );
        await expectStatusCode(
          await patch(file.id, { units: {} }, T_GROUPS),
          400,
        );
        const stored = await storedSummary(file);
        expect(stored.rows).toEqual(groupRows);
      });

      it("offers no kt reading for the document-wide MT check", async () => {
        const file = await createChecked();
        await expectStatusCode(
          await patch(file.id, { units: { doc: "kt" } }),
          400,
        );
      });
    });

    it("clears overrides of converted rows", async () => {
      const file = await createChecked({
        overrides: { "0": decision(2, "I.1.1"), "2": decision(100, "II.1.1") },
      });
      const res = await patch(file.id, { units: { doc: "Mt" } });
      await expectStatusCode(res, 200);
      expect((await res.json()).data.clearedDecisions).toBe(1);
      const stored = await storedSummary(file);
      expect(stored.overrides).toEqual({ "2": decision(100, "II.1.1") });

      const namespaced = await createChecked({
        overrides: {
          columnMappings: {},
          rowDecisions: {
            "1": decision(3, "I.2.1"),
            "2": decision(100, "II.1.1"),
          },
        },
      });
      await expectStatusCode(
        await patch(namespaced.id, { units: { doc: "Mt" } }),
        200,
      );
      const namespacedStored = await storedSummary(namespaced);
      expect(namespacedStored.overrides).toEqual({
        columnMappings: {},
        rowDecisions: { "2": decision(100, "II.1.1") },
      });
    });

    it("rejects an answer computed under other readings with 409", async () => {
      const file = await createChecked();
      // Unit confirmed as Mt; a card still showing tonnes answers the total.
      await expectStatusCode(
        await patch(file.id, { units: { doc: "Mt" } }),
        200,
      );
      const before = await storedSummary(file);

      const stale = await patch(file.id, { total: { candidate: 0 } }, T_NONE);
      await expectStatusCode(stale, 409);
      expect((await stale.json()).error.code).toBe("source-checks-conflict");
      const staleFormat = await patch(
        file.id,
        { units: { doc: "t" } },
        { units: { doc: "Mt" }, numberFormat: "english" },
      );
      await expectStatusCode(staleFormat, 409);

      const after = await storedSummary(file);
      expect(after.rows).toEqual(before.rows);
      expect(after.extractionSummary).toEqual(before.extractionSummary);

      // Without `expected` the body is invalid.
      await expectStatusCode(
        await patch(file.id, { total: { candidate: 0 } }, false),
        400,
      );
    });

    it("reports no cleared decisions when no row changed", async () => {
      const file = await createChecked({
        overrides: { "0": decision(2, "I.1.1") },
      });
      const res = await patch(file.id, { units: { doc: "t" } });
      await expectStatusCode(res, 200);
      expect((await res.json()).data.clearedDecisions).toBe(0);
    });

    it("rejects a stale write with 409 source-checks-conflict", async () => {
      const file = await createChecked();
      // Snapshot of the stored version before any answer is written.
      const stale = await db.models.ImportedInventoryFile.findByPk(file.id);
      assert.ok(stale);

      await expectStatusCode(
        await patch(file.id, { units: { doc: "Mt" } }),
        200,
      );

      // The second request reads the old snapshot, as if it had read before the
      // first write landed.
      const findOne = jest
        .spyOn(db.models.ImportedInventoryFile, "findOne")
        .mockResolvedValueOnce(stale);
      try {
        const conflict = await patch(file.id, { total: { candidate: 0 } });
        await expectStatusCode(conflict, 409);
        expect((await conflict.json()).error.code).toBe(
          "source-checks-conflict",
        );
        expect(findOne).toHaveBeenCalledTimes(1);
      } finally {
        findOne.mockRestore();
      }

      // The first answer was not reverted by the stale write.
      const afterConflict = await storedSummary(file);
      expect(afterConflict.extractionSummary.sourceChecks?.unit).toMatchObject({
        status: "confirmed",
        reading: "Mt",
      });
      expect(afterConflict.extractionSummary.sourceChecks?.total?.status).toBe(
        "pending",
      );
      expect(afterConflict.rows[0].totalCO2e).toBe(2_000_000);

      // The refetched client resends the losing answer: nothing is lost.
      await expectStatusCode(
        await patch(
          file.id,
          { total: { candidate: 0 } },
          { units: { doc: "Mt" }, numberFormat: null },
        ),
        200,
      );
      const stored = await storedSummary(file);
      expect(stored.extractionSummary.sourceChecks?.unit).toMatchObject({
        status: "confirmed",
        reading: "Mt",
      });
      expect(stored.extractionSummary.sourceChecks?.total).toMatchObject({
        status: "confirmed",
        selected: { value: 5_000_000, origin: "document" },
      });
      expect(stored.extractionSummary.importedSum).toBe(5_000_100);
    });

    it("answers unit and total in one request", async () => {
      const file = await createChecked();
      await expectStatusCode(
        await patch(file.id, { units: { doc: "Mt" }, total: { candidate: 0 } }),
        200,
      );
      const stored = await storedSummary(file);
      expect(stored.extractionSummary.sourceChecks?.unit?.status).toBe(
        "confirmed",
      );
      expect(stored.extractionSummary.sourceChecks?.total).toMatchObject({
        status: "confirmed",
        selected: { value: 5_000_000, origin: "document", page: 12 },
      });
    });

    it("applies number format reading", async () => {
      const ambiguous = row("I.1.1", 6.6, {
        co2: 6.6,
        numberCheck: true,
        totalCO2eText: "6.600",
        printedFactor: 1,
        extractedGases: { co2: 6.6, numberFormat: "english", unit: "t" },
      });
      const file = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "plan.pdf",
        fileType: "pdf",
        fileSize: 10,
        originalFileName: "plan.pdf",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        mappingConfiguration: {
          rows: [ambiguous, row("II.1.1", 100)],
          extractionSummary: {
            reportedTotals: [],
            droppedRows: {},
            importedSum: 106.6,
            yearAssumed: false,
            sourceChecks: {
              numberFormat: {
                status: "pending",
                reading: "english",
                examples: [{ label: "Residential", text: "6.600" }],
              },
            },
          },
        },
      });
      const english = { units: {}, numberFormat: "english" } as const;
      await expectStatusCode(
        await patch(file.id, { numberFormat: "european" }, english),
        200,
      );
      const stored = await storedSummary(file);
      expect(stored.rows[0]).toMatchObject({ totalCO2e: 6600, co2: null });
      expect(stored.rows[1].totalCO2e).toBe(100);
      expect(stored.extractionSummary.importedSum).toBe(6700);
      expect(stored.extractionSummary.sourceChecks?.numberFormat).toMatchObject(
        { status: "confirmed", reading: "european" },
      );

      // Back to the extraction reading: the extracted gases return.
      await expectStatusCode(
        await patch(
          file.id,
          { numberFormat: "english" },
          { units: {}, numberFormat: "european" },
        ),
        200,
      );
      const back = await storedSummary(file);
      expect(back.rows[0]).toMatchObject({ totalCO2e: 6.6, co2: 6.6 });
      expect(back.extractionSummary.importedSum).toBe(106.6);
    });

    it("rejects wrong status", async () => {
      const extracting = await createChecked({
        status: ImportStatusEnum.EXTRACTING,
      });
      await expectStatusCode(
        await patch(extracting.id, { units: { doc: "Mt" } }),
        400,
      );

      const otherUserId = randomUUID();
      await db.models.User.upsert({ userId: otherUserId, name: "OTHER_USER" });
      const others = await createChecked({ userId: otherUserId });
      await expectStatusCode(
        await patch(others.id, { units: { doc: "Mt" } }),
        404,
      );
      const stored = await storedSummary(others);
      expect(stored.rows).toEqual(storedRows);
    });

    it("approve blocks pending checks", async () => {
      const pending = await createChecked();
      const res = await approveImport(
        mockRequest({ importedFileId: pending.id }),
        {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventory.inventoryId,
          }),
        },
      );
      await expectStatusCode(res, 409);
      const json = await res.json();
      expect(json.error.code).toBe("source-checks-pending");
      await pending.reload();
      expect(pending.importStatus).toBe(ImportStatusEnum.WAITING_FOR_APPROVAL);

      // A summary stored before source checks has none: approval as before.
      const fileContent = await createMockXLSXFile();
      const legacy = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: testUserID,
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        fileName: "test-file.xlsx",
        fileType: "xlsx",
        fileSize: fileContent.length,
        originalFileName: "test-file.xlsx",
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        data: fileContent,
        validationResults: {
          detectedColumns: { gpcRefNo: 0, activityAmount: 4 },
          errors: [],
          warnings: [],
        },
        mappingConfiguration: {
          rows: [],
          extractionSummary: {
            reportedTotals: [],
            droppedRows: {},
            importedSum: 0,
            yearAssumed: false,
          },
        },
      });
      const approved = await approveImport(
        mockRequest({ importedFileId: legacy.id, mappingOverrides: {} }),
        {
          params: Promise.resolve({
            city: city.cityId,
            inventory: inventory.inventoryId,
          }),
        },
      );
      await expectStatusCode(approved, 202);
      await legacy.reload();
      expect(legacy.importStatus).not.toBe(
        ImportStatusEnum.WAITING_FOR_APPROVAL,
      );
    });
  });
});
