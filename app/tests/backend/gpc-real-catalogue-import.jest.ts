/**
 * CC-1201: III.x.3 and VI.1 reach the database through real import, on the
 * catalogue built by the migrations and the GPC seeder. This suite creates no
 * catalogue rows on purpose: review round 1 found that fabricated rows hid a
 * rejected reference.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";
import Excel from "exceljs";
import env from "@next/env";
import { POST as approveImport } from "@/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route";
import ActivityService from "@/backend/ActivityService";
import {
  listNotationKeyCandidateGroups,
  saveInventoryNotationKeys,
} from "@/backend/agentic/ghgi/stationary-energy/notation-keys";
import ECRFImportService, {
  type ECRFImportResult,
} from "@/backend/ECRFImportService";
import type { ParsedFileData } from "@/backend/FileParserService";
import ImportMappingService from "@/backend/ImportMappingService";
import { buildImportResult } from "@/backend/ImportResultBuilder";
import {
  findPendingRows,
  findReviewRows,
  previewImportRows,
} from "@/backend/ImportRowPreviewService";
import InventoryImportService from "@/backend/InventoryImportService";
import {
  buildBulkInventoryImportResult,
  InventoryFileAutoImportService,
} from "@/backend/InventoryFileAutoImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import {
  getEmissionResults,
  getEmissionsBreakdown,
} from "@/backend/ResultsService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { isImportedWasteRef } from "@/util/GHGI/reported-totals";
import {
  GlobalWarmingPotentialTypeEnum,
  ImportStatusEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
  testUserID,
} from "../helpers";
import {
  cleanupTestData,
  createTestData,
  type TestData,
} from "../helpers/testDataCreationHelper";

const PREFIX = "XX_CC1201R_";
const EXCLUDED_WASTE = ["III.1.3", "III.2.3", "III.3.3", "III.4.3"];
const EXCLUDED = [...EXCLUDED_WASTE, "VI.1"];
const CONTROLS = ["III.1.1", "III.1.2", "III.4.1", "III.4.2"];
const REFS = [...EXCLUDED, ...CONTROLS];

// Tonnes per row, all different so a swapped row cannot pass.
const tonnes = (ref: string) => 10 * (REFS.indexOf(ref) + 1);
const CONTROL_KG = CONTROLS.reduce((sum, ref) => sum + tonnes(ref) * 1000, 0);

const WASTE_SUBSECTORS: Record<string, string> = {
  "III.1": "Solid Waste Disposal",
  "III.2": "Biological Treatment of Waste",
  "III.3": "Incineration and Open Burning",
  "III.4": "Wastewater Treatment and Discharge",
};

function extractedRow(ref: string) {
  const isOther = ref === "VI.1";
  return {
    year: 2022,
    sector: isOther ? "Other Scope 3" : "Waste",
    subsector: isOther
      ? "Other Scope 3"
      : WASTE_SUBSECTORS[ref.split(".").slice(0, 2).join(".")],
    gpcRefNo: ref,
    totalCO2e: tonnes(ref),
  };
}

function parsedFile(): ParsedFileData {
  const headers = ["GPC ref. no.", "Total CO2e"];
  const sheet = {
    name: "Inventory",
    headers,
    rows: REFS.map((ref) => ({
      [headers[0]]: ref,
      [headers[1]]: tonnes(ref),
    })),
    rowNumbers: REFS.map((_, index) => index + 2),
  };
  return { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData;
}

describe("real catalogue import of III.x.3 and VI.1", () => {
  let city: City;
  let user: User;
  const inventoryIds: string[] = [];

  async function newInventory(
    inventoryType = InventoryTypeEnum.GPC_BASIC,
  ): Promise<Inventory> {
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2022,
      totalEmissions: 0,
      inventoryType,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    inventoryIds.push(inventory.inventoryId);
    return inventory;
  }

  async function expectImported(inventoryId: string) {
    const stored = await db.models.InventoryValue.findAll({
      where: { inventoryId },
    });
    expect(stored.map((value) => value.gpcReferenceNumber).sort()).toEqual(
      [...REFS].sort(),
    );
    for (const value of stored) {
      const ref = value.gpcReferenceNumber!;
      expect(value.omitFromTotal).toBe(EXCLUDED.includes(ref));
      expect(BigInt(value.co2eq as unknown as string)).toBe(
        BigInt(tonnes(ref) * 1000),
      );
    }

    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(CONTROL_KG);

    const waste = await getEmissionsBreakdown(inventoryId, "waste");
    expect(waste.grossTotalEmissions.toNumber()).toBe(CONTROL_KG);
    expect(
      Object.fromEntries(
        waste.omittedFromTotal.map((row) => [
          row.gpcReferenceNumber,
          row.totalEmissions.toNumber(),
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        EXCLUDED_WASTE.map((ref) => [ref, tonnes(ref) * 1000]),
      ),
    );
    // A restored subcategory gives the row its scope column.
    for (const row of waste.omittedFromTotal) {
      expect(Object.keys(row.scopes)).toEqual(["1"]);
    }

    const other = await getEmissionsBreakdown(inventoryId, "other-scope-3");
    expect(other.byScope).toEqual([]);
    expect(other.omittedFromTotal).toHaveLength(1);
    expect(other.omittedFromTotal[0].gpcReferenceNumber).toBe("VI.1");
    expect(other.omittedFromTotal[0].totalEmissions.toNumber()).toBe(
      tonnes("VI.1") * 1000,
    );
    expect(Object.keys(other.omittedFromTotal[0].scopes)).toEqual(["3"]);
  }

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    user = await db.models.User.create({
      userId: randomUUID(),
      name: `${PREFIX}user`,
    });
  });

  afterAll(async () => {
    await db.models.Version.destroy({ where: { inventoryId: inventoryIds } });
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventoryIds },
    });
    await db.models.Inventory.destroy({ where: { inventoryId: inventoryIds } });
    await user?.destroy();
    await city?.destroy();
    if (db.sequelize) await db.sequelize.close();
  });

  it("resolves all five references on the seeded catalogue", async () => {
    for (const ref of EXCLUDED) {
      expect(await ECRFImportService.lookupGPCReference(ref)).not.toBeNull();
    }
  });

  it("stores extracted rows through fromExtractedRows", async () => {
    const { inventoryId } = await newInventory();
    const extracted = await ECRFImportService.fromExtractedRows(
      REFS.map(extractedRow),
    );
    expect(extracted.errors).toEqual([]);

    const summary = await InventoryImportService.importECRFData(
      inventoryId,
      extracted,
      user.userId,
    );
    expect(summary.errors).toEqual([]);
    await expectImported(inventoryId);
  });

  it("stores file rows through processECRFFile", async () => {
    const { inventoryId } = await newInventory();
    const processed: ECRFImportResult = await ECRFImportService.processECRFFile(
      parsedFile(),
      {
        gpcRefNo: 0,
        totalCO2e: 1,
      },
    );
    expect(processed.errors).toEqual([]);
    expect(processed.rows.filter((row) => row.errors?.length)).toEqual([]);

    const summary = await InventoryImportService.importECRFData(
      inventoryId,
      processed,
      user.userId,
    );
    expect(summary.errors).toEqual([]);
    await expectImported(inventoryId);
  });

  it("holds a structured file row whose stated scope conflicts with its reference", async () => {
    const headers = ["GPC ref. no.", "Scope", "Total CO2e"];
    const sheet = {
      name: "Inventory",
      headers,
      rows: [
        {
          [headers[0]]: "III.4.3",
          [headers[1]]: "Scope 3",
          [headers[2]]: 6300,
        },
      ],
      rowNumbers: [2],
    };
    const processed = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
    );
    const pending = findPendingRows(processed);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      suggestedRefNo: "III.4.3",
      scope: "Scope 3",
      expectedScope: 1,
    });
  });

  it("uses the seeded database scope for I.4.4 even when the static table has no scope", async () => {
    const headers = ["GPC ref. no.", "Scope", "Total CO2e"];
    const sheet = {
      name: "Inventory",
      headers,
      rows: [{ [headers[0]]: "I.4.4", [headers[1]]: "3", [headers[2]]: 42 }],
      rowNumbers: [2],
    };
    const result = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
    );
    expect(findPendingRows(result)).toEqual([
      expect.objectContaining({ suggestedRefNo: "I.4.4", expectedScope: 1 }),
    ]);
  });

  it("accepts the database scope when correcting an I.4.4 conflict", async () => {
    const csv = "GPC ref. no.,Scope,Total CO2e\nI.4.4,3,42\n";
    const file = {
      id: "i44-file",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(file);
    const token = initial.importResult.rows[0].review?.decisionToken;
    const { importResult } = await buildImportResult(file, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "correct-scope",
          decisionFileId: "i44-file",
          decisionToken: token,
          decisionRef: "I.4.4",
          decisionScope: "3",
          decisionValue: 42,
          scope: "1",
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(0);
    expect(findReviewRows(importResult)[0]).toMatchObject({
      expectedScope: 1,
      finalScope: "1",
      decision: "correct-scope",
    });
  });

  it("does not let a keep decision dismiss an I.4.4 scope conflict", async () => {
    const csv = "GPC ref. no.,Scope,Total CO2e\nI.4.4,3,42\n";
    const file = {
      id: "i44-keep-file",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(file);
    const token = initial.importResult.rows[0].review?.decisionToken;
    const { importResult } = await buildImportResult(file, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "keep",
          decisionFileId: "i44-keep-file",
          decisionToken: token,
          decisionRef: "I.4.4",
          decisionScope: "3",
          decisionValue: 42,
        },
      },
    });
    expect(findPendingRows(importResult)).toEqual([
      expect.objectContaining({ suggestedRefNo: "I.4.4", expectedScope: 1 }),
    ]);
  });

  it("uses the database scope for an extracted I.4.4 row", async () => {
    const file = {
      id: "pdf-i44",
      fileType: "pdf",
      mappingConfiguration: {
        rows: [
          {
            year: 2022,
            sector: "Stationary Energy",
            subsector: "Energy Industries",
            category: null,
            gpcRefNo: "I.4.4",
            scope: "3",
            refSource: "document",
            totalCO2e: 42,
          },
        ],
      },
      validationResults: {},
    } as unknown as Parameters<typeof buildImportResult>[0];
    const { importResult } = await buildImportResult(file);
    expect(findPendingRows(importResult)).toEqual([
      expect.objectContaining({ suggestedRefNo: "I.4.4", expectedScope: 1 }),
    ]);
  });

  it("does not hold an explicit matching waste reference in a near-eCRF file", async () => {
    const csv =
      "GPC reference number,Total emissions,Notation key,Scope,Sector,Subsector\nIII.4.3,6300,,1,Waste,Wastewater Treatment and Discharge\n";
    const result = await buildBulkInventoryImportResult({
      kind: "near-ecrf",
      buffer: Buffer.from(csv),
      fileType: "csv",
      validation: {} as never,
    });
    expect(result.rows).toHaveLength(1);
    expect(findPendingRows(result)).toHaveLength(0);
  });

  it("warns without blocking when a structured row has an invalid scope", async () => {
    const headers = ["GPC ref. no.", "Scope", "Total CO2e"];
    const sheet = {
      name: "Inventory",
      headers,
      rows: [
        { [headers[0]]: "III.4.1", [headers[1]]: "unknown", [headers[2]]: 42 },
      ],
      rowNumbers: [2],
    };
    const result = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
    );
    const preview = await previewImportRows(
      result,
      InventoryTypeEnum.GPC_BASIC,
    );
    expect(preview.pendingRows).toBe(0);
    // The stated scope is unusable, so the scope comes from the reference.
    expect(preview.scopeWarnings).toEqual([]);
    expect(preview.inferredScopeRows).toMatchObject([
      {
        rowNumber: 2,
        gpcRefNo: "III.4.1",
        scope: "1",
        scopeOrigin: "reference",
        originalScope: "unknown",
      },
    ]);
  });

  it("warns about an invalid scope even when the reference is inferred from labels", async () => {
    const headers = ["Sector", "Subsector", "Scope", "Total CO2e"];
    const sheet = {
      name: "Inventory",
      headers,
      rows: [
        {
          Sector: "Stationary Energy",
          Subsector: "Residential Buildings",
          Scope: "unknown",
          "Total CO2e": 42,
        },
      ],
      rowNumbers: [2],
    };
    const result = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { sector: 0, subsector: 1, scope: 2, totalCO2e: 3 },
    );
    const preview = await previewImportRows(
      result,
      InventoryTypeEnum.GPC_BASIC,
    );
    expect(preview.pendingRows).toBe(0);
    // The stated scope is unusable, so the scope comes from the reference.
    expect(preview.scopeWarnings).toEqual([]);
    expect(preview.inferredScopeRows).toMatchObject([
      {
        rowNumber: 2,
        gpcRefNo: "I.1.1",
        scope: "1",
        scopeOrigin: "reference",
        originalScope: "unknown",
      },
    ]);
  });

  it("keeps a second identical conflict pending when only the first row is decided", async () => {
    const csv =
      "GPC ref. no.,Scope,Total CO2e\nIII.4.3,3,6300\nIII.4.3,3,6300\n";
    const file = {
      id: "duplicate-fixture",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = (await buildImportResult(file)).importResult;
    const decision = {
      reviewDecision: "correct-scope",
      decisionFileId: file.id,
      decisionToken: initial.rows[0].review?.decisionToken,
      decisionRef: "III.4.3",
      decisionScope: "3",
      decisionValue: 6300,
      scope: "1",
    };
    const result = (
      await buildImportResult(file, {
        rowDecisions: { "0": decision, "1": decision },
      })
    ).importResult;
    expect(findPendingRows(result).map((row) => row.rowIndex)).toEqual([1]);
  });

  it.each([
    ["correct-scope", "scope", null],
    ["correct-scope", "scope", "invalid"],
    ["reclassify", "gpcRefNo", null],
    ["reclassify", "gpcRefNo", "invalid"],
  ])(
    "holds a conflict with %s %s set to %s",
    async (reviewDecision, field, value) => {
      const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,3,6300\n";
      const file = {
        id: "invalid-final",
        fileType: "csv",
        data: Buffer.from(csv),
        mappingConfiguration: {},
        validationResults: {
          detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
        },
      } as unknown as Parameters<typeof buildImportResult>[0];
      const initial = (await buildImportResult(file)).importResult;
      const result = (
        await buildImportResult(file, {
          rowDecisions: {
            "0": {
              reviewDecision,
              [field]: value,
              decisionFileId: file.id,
              decisionToken: initial.rows[0].review?.decisionToken,
              decisionRef: "III.4.3",
              decisionScope: "3",
              decisionValue: 6300,
            },
          },
        })
      ).importResult;
      expect(findPendingRows(result)).toHaveLength(1);
    },
  );

  it("applies a reviewed scope correction to a structured import", async () => {
    const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\n";
    const importedFile = {
      id: "structured-fixture",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(importedFile);
    const { importResult } = await buildImportResult(importedFile, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "correct-scope",
          decisionFileId: "structured-fixture",
          decisionToken: initial.importResult.rows[0].review?.decisionToken,
          scope: "1",
          decisionRef: "III.4.3",
          decisionScope: "Scope 3",
          decisionValue: 6300,
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(0);
    expect(importResult.rows[0].gpcRefNo).toBe("III.4.3");
    const scope = await db.models.Scope.findByPk(importResult.rows[0].scopeId);
    expect(scope?.scopeName).toBe("1");
    expect(findReviewRows(importResult)[0]).toMatchObject({
      scope: "Scope 3",
      decision: "correct-scope",
    });
  });

  it("reviews and applies a reference correction from a real XLSX file", async () => {
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("Inventory");
    sheet.addRow(["GPC ref. no.", "Scope", "Total CO2e"]);
    sheet.addRow(["III.4.3", "3", 6300]);
    const file = {
      id: "xlsx-fixture",
      fileType: "xlsx",
      data: Buffer.from(await workbook.xlsx.writeBuffer()),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(file);
    expect(findPendingRows(initial.importResult)).toHaveLength(1);
    const token = initial.importResult.rows[0].review?.decisionToken;
    const { importResult } = await buildImportResult(file, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "reclassify",
          decisionFileId: "xlsx-fixture",
          decisionToken: token,
          decisionRef: "III.4.3",
          decisionScope: "3",
          decisionValue: 6300,
          gpcRefNo: "III.4.2",
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(0);
    expect(importResult.rows[0].gpcRefNo).toBe("III.4.2");
    expect(
      (await db.models.Scope.findByPk(importResult.rows[0].scopeId))?.scopeName,
    ).toBe("3");
  });

  it("rejects a decision made for another file even if row values match", async () => {
    const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\n";
    const file = {
      id: "file-b",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(file);
    const { importResult } = await buildImportResult(file, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "correct-scope",
          decisionFileId: "file-a",
          decisionToken: initial.importResult.rows[0].review?.decisionToken,
          scope: "1",
          decisionRef: "III.4.3",
          decisionScope: "Scope 3",
          decisionValue: 6300,
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(1);
  });

  it("rejects a stale decision after the same file is re-extracted with different row context", async () => {
    const source = {
      year: 2022,
      sector: "Waste",
      subsector: "Wastewater Treatment and Discharge",
      category: "First row",
      gpcRefNo: "III.4.3",
      scope: "3",
      refSource: "document",
      totalCO2e: 6300,
    };
    const file = {
      id: "same-file",
      fileType: "pdf",
      mappingConfiguration: { rows: [source] },
      validationResults: {},
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(file);
    const token = initial.importResult.rows[0].review?.decisionToken;
    file.mappingConfiguration = {
      rows: [{ ...source, category: "Changed row" }],
    };
    const { importResult } = await buildImportResult(file, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "correct-scope",
          decisionFileId: "same-file",
          decisionToken: token,
          scope: "1",
          decisionRef: "III.4.3",
          decisionScope: "3",
          decisionValue: 6300,
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(1);
  });

  it("keeps the model's original scope text when its normalized value differs", async () => {
    const result = await ECRFImportService.fromExtractedRows([
      {
        year: 2022,
        sector: "Waste",
        subsector: "Wastewater Treatment And Discharge",
        category: null,
        gpcRefNo: "III.4.3",
        scope: "3",
        originalScope: "Scope 3",
        refSource: "document",
        totalCO2e: 6300,
      },
    ]);
    expect(result.rows[0].review?.scope).toBe("Scope 3");
    expect(result.rows[0].review?.finalScope).toBe("3");
  });

  it("does not allow a review decision to create a new reference and scope conflict", async () => {
    const importedFile = {
      id: "pdf-fixture",
      fileType: "pdf",
      mappingConfiguration: {
        rows: [
          {
            year: 2022,
            sector: "Waste",
            subsector: "Wastewater Treatment and Discharge",
            category: null,
            gpcRefNo: "III.4.3",
            scope: "1",
            refSource: "inferred",
            totalCO2e: 6300,
          },
        ],
      },
      validationResults: {},
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(importedFile);
    const { importResult } = await buildImportResult(importedFile, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "reclassify",
          decisionFileId: "pdf-fixture",
          decisionToken: initial.importResult.rows[0].review?.decisionToken,
          gpcRefNo: "III.4.2",
          decisionRef: "III.4.3",
          decisionScope: "1",
          decisionValue: 6300,
        },
      },
    });
    expect(findPendingRows(importResult)).toHaveLength(1);
    expect(importResult.rows[0].gpcRefNo).toBe("III.4.3");
  });

  it.each([{ scope: "1" }, { gpcRefNo: "III.4.2" }])(
    "does not let legacy PDF overrides hide a conflict without a decision: %j",
    async (override) => {
      const file = {
        fileType: "pdf",
        mappingConfiguration: {
          rows: [
            {
              year: 2022,
              sector: "Waste",
              subsector: "Wastewater Treatment and Discharge",
              category: null,
              gpcRefNo: "III.4.3",
              scope: "3",
              refSource: "document",
              totalCO2e: 6300,
            },
          ],
        },
        validationResults: {},
      } as unknown as Parameters<typeof buildImportResult>[0];
      const { importResult } = await buildImportResult(file, { "0": override });
      expect(findPendingRows(importResult)).toHaveLength(1);
    },
  );

  describe("legacy per-row overrides and the final reference/scope pair", () => {
    const legacyFile = () =>
      ({
        id: "legacy-final-pair",
        fileType: "pdf",
        mappingConfiguration: {
          rows: [
            {
              year: 2022,
              sector: "Stationary Energy",
              subsector: "Residential buildings",
              category: null,
              gpcRefNo: "I.1.1",
              scope: "1",
              refSource: "document",
              totalCO2e: 6300,
            },
          ],
        },
        validationResults: {},
      }) as unknown as Parameters<typeof buildImportResult>[0];

    it("holds a legacy override that pairs I.4.3 with the stated scope 1", async () => {
      const { importResult } = await buildImportResult(legacyFile(), {
        "0": { gpcRefNo: "I.4.3", scope: "1" },
      });
      expect(importResult.rows[0].gpcRefNo).toBe("I.4.3");
      const pending = findPendingRows(importResult);
      expect(pending).toHaveLength(1);
      expect(pending[0].issue).toBe("reference-conflict");
      const preview = await previewImportRows(
        importResult,
        InventoryTypeEnum.GPC_BASIC,
      );
      expect(preview.pendingRows).toBe(1);
      expect(preview.rows.find((r) => r.status === "pending")).toBeDefined();
    });

    it("lets a compatible legacy override through", async () => {
      const { importResult } = await buildImportResult(legacyFile(), {
        "0": { gpcRefNo: "I.2.1", scope: "1" },
      });
      expect(findPendingRows(importResult)).toHaveLength(0);
    });

    it("does not hold a legacy override with a missing or invalid scope", async () => {
      for (const scope of [null, "not a scope"]) {
        const { importResult } = await buildImportResult(legacyFile(), {
          "0": { gpcRefNo: "I.4.3", scope },
        });
        expect(findPendingRows(importResult)).toHaveLength(0);
      }
    });
  });

  it("does not apply a forged review decision to a row that needs no review", async () => {
    const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,6300\n";
    const importedFile = {
      id: "file-safe",
      fileType: "csv",
      data: Buffer.from(csv),
      mappingConfiguration: {},
      validationResults: {
        detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
      },
    } as unknown as Parameters<typeof buildImportResult>[0];
    const initial = await buildImportResult(importedFile);
    const { importResult } = await buildImportResult(importedFile, {
      columnMappings: {},
      rowDecisions: {
        "0": {
          reviewDecision: "skip",
          decisionFileId: "file-safe",
          decisionToken: initial.importResult.rows[0].review?.decisionToken,
          decisionRef: "III.4.1",
          decisionScope: "1",
          decisionValue: 6300,
        },
      },
    });
    expect(importResult.rows[0].issue).not.toBe("skipped-in-review");
  });

  it("saves a manual activity on III.x.3 and leaves III.x.2 alone", async () => {
    const { inventoryId } = await newInventory();
    for (const gpcReferenceNumber of ["III.1.3", "III.1.2"]) {
      await ActivityService.createActivity(
        {
          activityData: {
            co2_amount: 5,
            co2_amount_unit: "units-kilograms",
            ch4_amount: 0,
            n2o_amount: 0,
          },
          metadata: {},
        },
        inventoryId,
        undefined,
        { gpcReferenceNumber, inputMethodology: "direct-measure" },
        [{ gas: "CO2" }],
        user.userId,
      );
    }
    const reloaded = await db.models.InventoryValue.findAll({
      where: { inventoryId },
    });
    const flags = Object.fromEntries(
      reloaded.map((value) => [value.gpcReferenceNumber, value.omitFromTotal]),
    );
    expect(flags).toEqual({ "III.1.3": true, "III.1.2": false });
    const imported = reloaded.find(
      (value) => value.gpcReferenceNumber === "III.1.3",
    );
    const subCategory = await db.models.SubCategory.findOne({
      where: { referenceNumber: "III.1.3" },
    });
    expect(imported!.subCategoryId).toBe(subCategory!.subcategoryId);
  });

  it("keeps a row that excludes imported waste in the total", async () => {
    const { inventoryId } = await newInventory();
    const extracted = await ECRFImportService.fromExtractedRows([
      {
        ...extractedRow("III.1.2"),
        scope: "3",
        category:
          "Waste generated in the city and sent to a regional landfill, excluding imported waste",
        totalCO2e: 1000,
      },
      {
        ...extractedRow("III.1.1"),
        category: "Landfilled waste excluding imported waste",
        totalCO2e: 2000,
      },
    ]);
    await InventoryImportService.importECRFData(
      inventoryId,
      extracted,
      user.userId,
    );
    const stored = await db.models.InventoryValue.findAll({
      where: { inventoryId },
    });
    expect(stored.map((value) => value.gpcReferenceNumber).sort()).toEqual([
      "III.1.1",
      "III.1.2",
    ]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(3_000_000);
  });

  it("keeps rows counted when a label reads like III.x.3", async () => {
    const { inventoryId } = await newInventory();
    const extracted = await ECRFImportService.fromExtractedRows([
      {
        ...extractedRow("III.1.1"),
        category:
          "Waste generated outside residential areas and treated in the city",
        totalCO2e: 2000,
      },
      {
        ...extractedRow("III.1.2"),
        scope: "3",
        category:
          "Waste generated outside and inside the city and treated in the city",
        totalCO2e: 1000,
      },
      {
        ...extractedRow("III.2.2"),
        scope: "3",
        category:
          "Waste generated outside the city\nand not treated in the city",
        totalCO2e: 500,
      },
      {
        // A true .3 statement with a wrong reference: counted, by plan step 6.
        ...extractedRow("III.3.1"),
        category: "Waste generated outside the city and treated in the city",
        totalCO2e: 100,
      },
    ]);
    await InventoryImportService.importECRFData(
      inventoryId,
      extracted,
      user.userId,
    );
    const stored = await db.models.InventoryValue.findAll({
      where: { inventoryId },
    });
    expect(stored.map((value) => value.gpcReferenceNumber).sort()).toEqual([
      "III.1.1",
      "III.1.2",
      "III.2.2",
      "III.3.1",
    ]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(3_600_000);
  });

  it("does not list III.x.3 as a notation key row to complete", async () => {
    const inventory = await newInventory();
    const wasteRefs = async () => {
      const groups = await listNotationKeyCandidateGroups({
        inventory,
        sectorReferenceNumbers: ["III"],
      });
      return groups.III.map(({ subCategory }) => subCategory.referenceNumber);
    };
    const empty = await wasteRefs();
    expect(empty).toHaveLength(8);
    expect(empty.filter(isImportedWasteRef)).toEqual([]);

    const subCategory = await db.models.SubCategory.findOne({
      where: { referenceNumber: "III.1.3" },
    });
    await saveInventoryNotationKeys({
      inventoryId: inventory.inventoryId,
      notationKeys: [
        {
          subCategoryId: subCategory!.subcategoryId,
          unavailableReason: "no-occurrance",
          unavailableExplanation: "None received",
        },
      ],
      userId: user.userId,
    });
    expect(await wasteRefs()).toContain("III.1.3");
  });

  it("keeps required import rows at 8 and accepts a III.x.3 file row", async () => {
    const inventory = await newInventory();
    const required = await ImportMappingService.getRequiredGPCRows(inventory);
    const waste = required.filter((row) =>
      row.gpcReferenceNumber.startsWith("III."),
    );
    expect(waste).toHaveLength(8);

    const preview = await ImportMappingService.createMappingPreview(
      inventory,
      parsedFile(),
      { gpcRefNo: 0, totalCO2e: 1 },
    );
    const row = preview.comparisons.find(
      ({ ecrfRow }) => ecrfRow?.gpcRefNo === "III.4.3",
    );
    expect(row!.status).toBe("mapped");
    expect(row!.mappingIssues).toBeUndefined();
  });

  describe("review of model-assigned III.x.3", () => {
    const SEEN = {
      decisionFileId: "pdf-fixture",
      decisionRef: "III.4.3",
      decisionValue: 6300,
    };
    const WASTEWATER = {
      year: 2022,
      sector: "Waste",
      subsector: "Wastewater Treatment And Discharge",
      category: "Wastewater Treatment & Discharge",
      totalCO2e: 6300,
    };

    async function pdfResult(
      rows: Record<string, unknown>[],
      overrides?: Record<string, unknown>,
    ) {
      const file = {
        id: "pdf-fixture",
        fileType: "pdf",
        mappingConfiguration: { rows },
        validationResults: {},
      } as never;
      const initial = await buildImportResult(file);
      const patched =
        overrides &&
        Object.fromEntries(
          Object.entries(overrides).map(([key, value]) => {
            const obj = value as Record<string, unknown>;
            return [
              key,
              obj?.decisionFileId === "pdf-fixture"
                ? {
                    ...obj,
                    decisionToken:
                      initial.importResult.rows[Number(key)]?.review
                        ?.decisionToken,
                  }
                : value,
            ];
          }),
        );
      return (await buildImportResult(file, patched)).importResult;
    }

    it("holds a Phoenix-shaped row and leaves it unchanged", async () => {
      const result = await pdfResult([
        { ...WASTEWATER, gpcRefNo: "III.4.3", scope: "1" },
      ]);
      expect(result.rows[0].gpcRefNo).toBe("III.4.3");
      const [pending] = findPendingRows(result);
      expect(pending).toMatchObject({
        issue: "direction-unconfirmed",
        value: 6300,
        suggestedRefNo: "III.4.3",
        category: WASTEWATER.category,
        quote: null,
        quoteFound: null,
      });
    });

    it.each([
      ["found, table heading", "Efluentes gerados fora do município", true],
      ["found but ambiguous", "Wastewater Treatment & Discharge", true],
      ["not found", "Imported from neighbouring cities", false],
    ])("keeps the row held when the quote is %s", async (_, quote, found) => {
      const result = await pdfResult([
        {
          ...WASTEWATER,
          gpcRefNo: "III.4.3",
          directionEvidence: quote,
          directionEvidenceFound: found,
        },
      ]);
      const [pending] = findPendingRows(result);
      expect(pending.quote).toBe(quote);
      expect(pending.quoteFound).toBe(found);
    });

    it("preserves a stated III.x.3 and does not hold it", async () => {
      const result = await pdfResult([
        {
          ...WASTEWATER,
          gpcRefNo: "III.4.3",
          refSource: "document",
          scope: "1",
        },
      ]);
      expect(result.rows[0].gpcRefNo).toBe("III.4.3");
      expect(findPendingRows(result)).toEqual([]);
    });

    it("holds a stated III.x.3 with scope 3 and leaves it unchanged", async () => {
      const result = await pdfResult([
        {
          ...WASTEWATER,
          gpcRefNo: "III.4.3",
          refSource: "document",
          scope: "3",
        },
      ]);
      expect(result.rows[0].gpcRefNo).toBe("III.4.3");
      const [pending] = findPendingRows(result);
      expect(pending).toMatchObject({
        issue: "reference-conflict",
        scope: "3",
        expectedScope: 1,
      });
    });

    it("does not hold III.x.1, III.x.2 or VI.1 rows", async () => {
      const result = await pdfResult(
        ["III.1.1", "III.1.2", "VI.1"].map((ref) => extractedRow(ref)),
      );
      expect(findPendingRows(result)).toEqual([]);
    });

    it("does not hold file rows", async () => {
      const processed = await ECRFImportService.processECRFFile(parsedFile(), {
        gpcRefNo: 0,
        totalCO2e: 1,
      });
      expect(findPendingRows(processed)).toEqual([]);
    });

    it("rejects a forged keep that changes an inferred reference", async () => {
      const result = await pdfResult(
        [{ ...WASTEWATER, gpcRefNo: "III.4.3", scope: "1" }],
        { "0": { reviewDecision: "keep", gpcRefNo: "III.4.2", ...SEEN } },
      );
      expect(result.rows[0].gpcRefNo).toBe("III.4.3");
      expect(findPendingRows(result)).toHaveLength(1);
    });

    it("stores a kept row as III.x.3, left out of the total", async () => {
      const { inventoryId } = await newInventory();
      const result = await pdfResult([{ ...WASTEWATER, gpcRefNo: "III.4.3" }], {
        "0": { reviewDecision: "keep", ...SEEN },
      });
      expect(findPendingRows(result)).toEqual([]);
      await InventoryImportService.importECRFData(inventoryId, result);
      const [stored] = await db.models.InventoryValue.findAll({
        where: { inventoryId },
      });
      expect(stored.gpcReferenceNumber).toBe("III.4.3");
      expect(stored.omitFromTotal).toBe(true);
    });

    it("stores a reclassified row with the chosen reference, counted", async () => {
      const { inventoryId } = await newInventory();
      const result = await pdfResult([{ ...WASTEWATER, gpcRefNo: "III.4.3" }], {
        "0": { reviewDecision: "reclassify", gpcRefNo: "III.4.1", ...SEEN },
      });
      expect(findPendingRows(result)).toEqual([]);
      expect(findReviewRows(result)[0].suggestedRefNo).toBe("III.4.3");
      await InventoryImportService.importECRFData(inventoryId, result);
      const [stored] = await db.models.InventoryValue.findAll({
        where: { inventoryId },
      });
      expect(stored.gpcReferenceNumber).toBe("III.4.1");
      expect(stored.omitFromTotal).toBe(false);
      const results = await getEmissionResults(inventoryId);
      expect(results.totalEmissions.toNumber()).toBe(6_300_000);
    });

    it("ignores a stale decision entirely", async () => {
      const result = await pdfResult([{ ...WASTEWATER, gpcRefNo: "III.1.1" }], {
        "0": {
          reviewDecision: "reclassify",
          gpcRefNo: "III.2.1",
          decisionRef: "III.4.3",
          decisionValue: 9,
        },
      });
      expect(result.rows[0].gpcRefNo).toBe("III.1.1");
    });

    it("does not store a skipped row", async () => {
      const { inventoryId } = await newInventory();
      const result = await pdfResult(
        [
          { ...WASTEWATER, gpcRefNo: "III.4.3" },
          { ...WASTEWATER, gpcRefNo: "III.4.1", totalCO2e: 10 },
        ],
        { "0": { reviewDecision: "skip", ...SEEN } },
      );
      expect(findPendingRows(result)).toEqual([]);
      await InventoryImportService.importECRFData(inventoryId, result);
      const stored = await db.models.InventoryValue.findAll({
        where: { inventoryId },
      });
      expect(stored.map((row) => row.gpcReferenceNumber)).toEqual(["III.4.1"]);
    });

    it.each([
      [{ reviewDecision: "confirmed", ...SEEN }],
      [{ reviewDecision: "keep" }],
      [{ reviewDecision: "keep", decisionRef: "III.1.3", decisionValue: 6300 }],
      [{ reviewDecision: "keep", decisionRef: "III.4.3", decisionValue: 7 }],
      [{ reviewDecision: "reclassify", ...SEEN }],
      [{ reviewDecision: "reclassify", gpcRefNo: "III.4.3", ...SEEN }],
      [{ totalCO2e: 7 }],
    ])(
      "keeps the row held after an incomplete decision %j",
      async (override) => {
        const result = await pdfResult(
          [{ ...WASTEWATER, gpcRefNo: "III.4.3" }],
          {
            "0": override,
          },
        );
        expect(findPendingRows(result)).toHaveLength(1);
      },
    );

    describe("approve route", () => {
      let testData: TestData;
      let importedFileId: string;
      let inventoryId: string;
      const params = () =>
        Promise.resolve({ city: testData.cityId, inventory: inventoryId });
      const approve = (mappingOverrides?: Record<string, unknown>) =>
        approveImport(mockRequest({ importedFileId, mappingOverrides }), {
          params: params(),
        });
      const tokenFor = async (id: string) => {
        const file = await db.models.ImportedInventoryFile.findByPk(id);
        return (await buildImportResult(file!)).importResult.rows[0].review
          ?.decisionToken;
      };
      const waitForCatalog = async (fileId: string) => {
        for (let i = 0; i < 100; i++) {
          const entry = await db.models.NativeInputCatalog.findOne({
            where: { kind: "inventory_import", sourceId: inventoryId },
          });
          if (entry?.labels?.importedFileId === fileId) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(
          "background inventory catalog synchronization did not finish",
        );
      };

      beforeAll(async () => {
        setupTests();
        testData = await createTestData({
          cityName: `${PREFIX}approve-city`,
          countryLocode: "XX",
        });
        await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
        const approveCity = await db.models.City.findByPk(testData.cityId);
        await approveCity!.addUser(testUserID);
        const inventory = await db.models.Inventory.create({
          inventoryId: randomUUID(),
          cityId: testData.cityId,
          inventoryName: `${PREFIX}approve`,
          year: 2022,
          inventoryType: InventoryTypeEnum.GPC_BASIC,
          globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        });
        inventoryId = inventory.inventoryId;
        inventoryIds.push(inventoryId);
        importedFileId = randomUUID();
        await db.models.ImportedInventoryFile.create({
          id: importedFileId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "review.pdf",
          originalFileName: "review.pdf",
          fileType: "pdf",
          fileSize: 1,
          data: Buffer.from("x"),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          mappingConfiguration: {
            rows: [{ ...WASTEWATER, gpcRefNo: "III.4.3" }],
          },
          rowCount: 1,
          validationResults: { errors: [], warnings: [] },
        });
      });

      beforeEach(async () => {
        await db.models.NativeInputCatalog.destroy({
          where: { kind: "inventory_import", sourceId: inventoryId },
        });
        await db.models.InventoryValue.destroy({ where: { inventoryId } });
      });

      afterAll(async () => {
        await db.models.ImportedInventoryFile.destroy({
          where: { id: importedFileId },
        });
        await db.models.InventoryValue.destroy({ where: { inventoryId } });
        await db.models.Inventory.destroy({ where: { inventoryId } });
        await cleanupTestData(testData);
        teardownTests();
      });

      it("rejects approval while a row has no decision", async () => {
        const response = await approve();
        await expectStatusCode(response, 409);
        const file =
          await db.models.ImportedInventoryFile.findByPk(importedFileId);
        expect(file!.importStatus).toBe(ImportStatusEnum.WAITING_FOR_APPROVAL);
      });

      it("rejects a legacy override that saves an incompatible final reference/scope pair", async () => {
        const legacyId = randomUUID();
        await db.models.ImportedInventoryFile.create({
          id: legacyId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "legacy.pdf",
          originalFileName: "legacy.pdf",
          fileType: "pdf",
          fileSize: 1,
          data: Buffer.from("x"),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          mappingConfiguration: {
            rows: [
              {
                year: 2022,
                sector: "Stationary Energy",
                subsector: "Residential buildings",
                category: null,
                gpcRefNo: "I.1.1",
                scope: "1",
                refSource: "document",
                totalCO2e: 6300,
              },
            ],
          },
          rowCount: 1,
          validationResults: { errors: [], warnings: [] },
        });
        try {
          const response = await approveImport(
            mockRequest({
              importedFileId: legacyId,
              mappingOverrides: { "0": { gpcRefNo: "I.4.3", scope: "1" } },
            }),
            { params: params() },
          );
          await expectStatusCode(response, 409);
          const file = await db.models.ImportedInventoryFile.findByPk(legacyId);
          expect(file!.importStatus).toBe(
            ImportStatusEnum.WAITING_FOR_APPROVAL,
          );
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(0);
        } finally {
          await db.models.ImportedInventoryFile.destroy({
            where: { id: legacyId },
          });
        }
      });

      it("rejects a forged decision", async () => {
        await expectStatusCode(
          await approve({ "0": { reviewDecision: "confirmed" } }),
          409,
        );
      });

      it("rejects a CSV with an unresolved scope conflict", async () => {
        const csvId = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\n";
        await db.models.ImportedInventoryFile.create({
          id: csvId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "review.csv",
          originalFileName: "review.csv",
          fileType: "csv",
          fileSize: Buffer.byteLength(csv),
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        try {
          const response = await approveImport(
            mockRequest({ importedFileId: csvId }),
            { params: params() },
          );
          await expectStatusCode(response, 409);
        } finally {
          await db.models.ImportedInventoryFile.destroy({
            where: { id: csvId },
          });
        }
      });

      it("starts only one import for simultaneous approvals", async () => {
        const csvId = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,42\n";
        await db.models.ImportedInventoryFile.create({
          id: csvId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "concurrent.csv",
          originalFileName: "concurrent.csv",
          fileType: "csv",
          fileSize: Buffer.byteLength(csv),
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        try {
          const responses = await Promise.all(
            [1, 2].map(() =>
              approveImport(mockRequest({ importedFileId: csvId }), {
                params: params(),
              }),
            ),
          );
          expect(
            responses.filter((response) => response.status === 202),
          ).toHaveLength(1);
          expect(
            responses.filter((response) => response.status !== 202),
          ).toHaveLength(1);
          let status: ImportStatusEnum | undefined;
          for (let i = 0; i < 100; i++) {
            status = (await db.models.ImportedInventoryFile.findByPk(csvId))
              ?.importStatus;
            if (
              status === ImportStatusEnum.COMPLETED ||
              status === ImportStatusEnum.FAILED
            )
              break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          expect(status).toBe(ImportStatusEnum.COMPLETED);
          await waitForCatalog(csvId);
        } finally {
          await db.models.ImportedInventoryFile.destroy({
            where: { id: csvId },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      });

      it("does not start two different files on the same inventory at once", async () => {
        const ids = [randomUUID(), randomUUID()];
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,42\n";
        for (const id of ids)
          await db.models.ImportedInventoryFile.create({
            id,
            userId: testUserID,
            cityId: testData.cityId,
            inventoryId,
            fileName: "concurrent.csv",
            originalFileName: "concurrent.csv",
            fileType: "csv",
            fileSize: Buffer.byteLength(csv),
            data: Buffer.from(csv),
            importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
            validationResults: {
              detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
            },
          });
        try {
          const responses = await Promise.all(
            ids.map((id) =>
              approveImport(mockRequest({ importedFileId: id }), {
                params: params(),
              }),
            ),
          );
          const accepted = responses
            .map((r, i) => (r.status === 202 ? ids[i] : null))
            .filter(Boolean);
          expect(accepted).toHaveLength(1);
          await waitForCatalog(accepted[0]!);
        } finally {
          await db.models.ImportedInventoryFile.destroy({ where: { id: ids } });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      }, 20000);

      it("does not let a bulk import start while a screen import owns the inventory", async () => {
        const activeId = randomUUID();
        const csv =
          "GPC ref. no.,CRF - Sector,CRF - Sub-sector,Scope,GHGs (metric tonnes CO2e) - Total CO2e\nIII.4.1,Waste,Wastewater Treatment and Discharge,1,42\n";
        await db.models.ImportedInventoryFile.create({
          id: activeId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "active.csv",
          originalFileName: "active.csv",
          fileType: "csv",
          fileSize: 1,
          data: Buffer.from("x"),
          importStatus: ImportStatusEnum.IMPORTING,
        });
        try {
          await expect(
            InventoryFileAutoImportService.importFile({
              buffer: Buffer.from(csv),
              originalFileName: "bulk-concurrency-test.csv",
              userId: testUserID,
              cityId: testData.cityId,
              inventoryId,
            }),
          ).rejects.toMatchObject({ code: "import_in_progress" });
        } finally {
          await db.models.ImportedInventoryFile.destroy({
            where: {
              inventoryId,
              originalFileName: ["active.csv", "bulk-concurrency-test.csv"],
            },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      }, 20000);

      it("marks a failed bulk import failed and rolls back all rows", async () => {
        const csv =
          "GPC ref. no.,CRF - Sector,CRF - Sub-sector,Scope,GHGs (metric tonnes CO2e) - Total CO2e\nIII.4.1,Waste,Wastewater Treatment and Discharge,1,42\nIII.4.2,Waste,Wastewater Treatment and Discharge,3,21\n";
        await db.sequelize!.query(`
          CREATE FUNCTION cc1201_bulk_fail() RETURNS trigger AS $$
          BEGIN IF NEW.inventory_id = '${inventoryId}'::uuid AND NEW.gpc_reference_number = 'III.4.2' THEN RAISE EXCEPTION 'simulated bulk row failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
          CREATE TRIGGER cc1201_bulk_fail BEFORE INSERT ON "InventoryValue" FOR EACH ROW EXECUTE FUNCTION cc1201_bulk_fail();
        `);
        try {
          await expect(
            InventoryFileAutoImportService.importFile({
              buffer: Buffer.from(csv),
              originalFileName: "bulk-failure-test.csv",
              userId: testUserID,
              cityId: testData.cityId,
              inventoryId,
            }),
          ).rejects.toThrow();
          const file = await db.models.ImportedInventoryFile.findOne({
            where: { inventoryId, originalFileName: "bulk-failure-test.csv" },
          });
          expect(file?.importStatus).toBe(ImportStatusEnum.FAILED);
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(0);
        } finally {
          await db.sequelize!.query(
            'DROP TRIGGER IF EXISTS cc1201_bulk_fail ON "InventoryValue"; DROP FUNCTION IF EXISTS cc1201_bulk_fail();',
          );
          await db.models.ImportedInventoryFile.destroy({
            where: { inventoryId, originalFileName: "bulk-failure-test.csv" },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      }, 20000);

      it.each([null, "invalid scope"])(
        "records the saved catalogue scope when the source scope is %s",
        async (sourceScope) => {
          const id = randomUUID();
          const source = {
            ...WASTEWATER,
            gpcRefNo: "III.4.3",
            scope: sourceScope,
          };
          await db.models.ImportedInventoryFile.create({
            id,
            userId: testUserID,
            cityId: testData.cityId,
            inventoryId,
            fileName: "fallback.pdf",
            originalFileName: "fallback.pdf",
            fileType: "pdf",
            fileSize: 1,
            data: Buffer.from("x"),
            importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
            mappingConfiguration: { rows: [source] },
            validationResults: {},
          });
          try {
            const file = (await db.models.ImportedInventoryFile.findByPk(id))!;
            const built = (await buildImportResult(file)).importResult;
            const savedScope = await db.models.Scope.findByPk(
              built.rows[0].scopeId,
            );
            expect(savedScope?.scopeName).toBe("1");
            const response = await approveImport(
              mockRequest({
                importedFileId: id,
                mappingOverrides: {
                  rowDecisions: {
                    "0": {
                      reviewDecision: "keep",
                      decisionFileId: id,
                      decisionToken: built.rows[0].review?.decisionToken,
                      decisionRef: "III.4.3",
                      decisionScope: sourceScope,
                      decisionValue: 6300,
                    },
                  },
                },
              }),
              { params: params() },
            );
            await expectStatusCode(response, 202);
            let completed = await db.models.ImportedInventoryFile.findByPk(id);
            for (
              let i = 0;
              i < 100 && completed?.importStatus === ImportStatusEnum.IMPORTING;
              i++
            ) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              completed = await db.models.ImportedInventoryFile.findByPk(id);
            }
            expect(completed?.importStatus).toBe(ImportStatusEnum.COMPLETED);
            expect(completed?.reviewHistory?.rows[0]).toMatchObject({
              originalScope: sourceScope,
              finalScope: "1",
            });
            const history = JSON.stringify(completed?.reviewHistory);
            await expectStatusCode(
              await approveImport(mockRequest({ importedFileId: id }), {
                params: params(),
              }),
              400,
            );
            expect(
              JSON.stringify(
                (await db.models.ImportedInventoryFile.findByPk(id))
                  ?.reviewHistory,
              ),
            ).toBe(history);
            expect(
              await db.models.InventoryValue.count({
                where: { inventoryId, gpcReferenceNumber: "III.4.3" },
              }),
            ).toBe(1);
            await waitForCatalog(id);
          } finally {
            await db.models.ImportedInventoryFile.destroy({ where: { id } });
            await db.models.InventoryValue.destroy({ where: { inventoryId } });
          }
        },
      );

      it("imports the validated snapshot when the stored source changes on claim", async () => {
        const id = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,42\n";
        await db.models.ImportedInventoryFile.create({
          id,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "snapshot.csv",
          originalFileName: "snapshot.csv",
          fileType: "csv",
          fileSize: csv.length,
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        await db.sequelize!
          .query(`CREATE FUNCTION cc1201_change_source() RETURNS trigger AS $$ BEGIN
          IF NEW.id = '${id}'::uuid AND NEW.import_status = 'importing' THEN
            NEW.data = convert_to('GPC ref. no.,Scope,Total CO2e' || chr(10) || 'III.4.2,3,99' || chr(10), 'UTF8');
          END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
          CREATE TRIGGER cc1201_change_source BEFORE UPDATE ON "ImportedInventoryFile" FOR EACH ROW EXECUTE FUNCTION cc1201_change_source();`);
        try {
          await expectStatusCode(
            await approveImport(mockRequest({ importedFileId: id }), {
              params: params(),
            }),
            202,
          );
          let file = await db.models.ImportedInventoryFile.findByPk(id);
          for (
            let i = 0;
            i < 100 && file?.importStatus === ImportStatusEnum.IMPORTING;
            i++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            file = await db.models.ImportedInventoryFile.findByPk(id);
          }
          expect(file?.importStatus).toBe(ImportStatusEnum.COMPLETED);
          const values = await db.models.InventoryValue.findAll({
            where: { inventoryId },
          });
          expect(values.map((value) => value.gpcReferenceNumber)).toEqual([
            "III.4.1",
          ]);
          await waitForCatalog(id);
        } finally {
          await db.sequelize!.query(
            'DROP TRIGGER IF EXISTS cc1201_change_source ON "ImportedInventoryFile"; DROP FUNCTION IF EXISTS cc1201_change_source();',
          );
          await db.models.ImportedInventoryFile.destroy({ where: { id } });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      });

      it("rolls back a stale worker without failing the active attempt", async () => {
        const id = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,42\n";
        await db.models.ImportedInventoryFile.create({
          id,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "stale.csv",
          originalFileName: "stale.csv",
          fileType: "csv",
          fileSize: csv.length,
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        await db.sequelize!
          .query(`CREATE FUNCTION cc1201_stale_claim() RETURNS trigger AS $$ BEGIN
          IF NEW.id = '${id}'::uuid AND OLD.import_status = 'waiting_for_approval' AND NEW.import_status = 'importing' THEN
            NEW.mapping_configuration = jsonb_set(NEW.mapping_configuration::jsonb, '{approvalAttemptId}', to_jsonb('new-attempt'::text));
          END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
          CREATE TRIGGER cc1201_stale_claim BEFORE UPDATE ON "ImportedInventoryFile" FOR EACH ROW EXECUTE FUNCTION cc1201_stale_claim();`);
        try {
          await expectStatusCode(
            await approveImport(mockRequest({ importedFileId: id }), {
              params: params(),
            }),
            202,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const file = await db.models.ImportedInventoryFile.findByPk(id);
          expect(file?.importStatus).toBe(ImportStatusEnum.IMPORTING);
          expect(file?.reviewHistory).toBeNull();
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(0);
        } finally {
          await db.sequelize!.query(
            'DROP TRIGGER IF EXISTS cc1201_stale_claim ON "ImportedInventoryFile"; DROP FUNCTION IF EXISTS cc1201_stale_claim();',
          );
          await db.models.ImportedInventoryFile.destroy({ where: { id } });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      });

      it("keeps a committed import completed when a follow-up fails", async () => {
        const id = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.1,1,42\n";
        await db.models.ImportedInventoryFile.create({
          id,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "followup.csv",
          originalFileName: "followup.csv",
          fileType: "csv",
          fileSize: csv.length,
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        const reload = jest
          .spyOn(db.models.ImportedInventoryFile.prototype, "reload")
          .mockRejectedValueOnce(new Error("follow-up failed"));
        try {
          await expectStatusCode(
            await approveImport(mockRequest({ importedFileId: id }), {
              params: params(),
            }),
            202,
          );
          let file = await db.models.ImportedInventoryFile.findByPk(id);
          for (
            let i = 0;
            i < 100 && file?.importStatus === ImportStatusEnum.IMPORTING;
            i++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            file = await db.models.ImportedInventoryFile.findByPk(id);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          file = await db.models.ImportedInventoryFile.findByPk(id);
          expect(reload).toHaveBeenCalled();
          expect(file?.importStatus).toBe(ImportStatusEnum.COMPLETED);
          expect(file?.reviewHistory).not.toBeNull();
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(1);
        } finally {
          reload.mockRestore();
          await db.models.ImportedInventoryFile.destroy({ where: { id } });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      });

      it("persists the reviewed scope decision when the import completes", async () => {
        const csvId = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\n";
        await db.models.ImportedInventoryFile.create({
          id: csvId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "corrected.csv",
          originalFileName: "corrected.csv",
          fileType: "csv",
          fileSize: Buffer.byteLength(csv),
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        try {
          const response = await approveImport(
            mockRequest({
              importedFileId: csvId,
              mappingOverrides: {
                columnMappings: {},
                rowDecisions: {
                  "0": {
                    reviewDecision: "correct-scope",
                    decisionFileId: csvId,
                    decisionToken: await tokenFor(csvId),
                    scope: "1",
                    decisionRef: "III.4.3",
                    decisionScope: "Scope 3",
                    decisionValue: 6300,
                  },
                },
              },
            }),
            { params: params() },
          );
          await expectStatusCode(response, 202);
          let file = await db.models.ImportedInventoryFile.findByPk(csvId);
          for (
            let i = 0;
            i < 100 && file?.importStatus === ImportStatusEnum.IMPORTING;
            i++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            file = await db.models.ImportedInventoryFile.findByPk(csvId);
          }
          expect(file?.importStatus).toBe(ImportStatusEnum.COMPLETED);
          await waitForCatalog(csvId);
          expect(file?.reviewHistory?.rows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                originalReference: "III.4.3",
                originalScope: "Scope 3",
                finalReference: "III.4.3",
                finalScope: "1",
                decision: "correct-scope",
              }),
            ]),
          );
          const value = await db.models.InventoryValue.findOne({
            where: { inventoryId, gpcReferenceNumber: "III.4.3" },
          });
          expect(value?.omitFromTotal).toBe(true);
        } finally {
          await db.models.ImportedInventoryFile.destroy({
            where: { id: csvId },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      });

      it("rolls back a failed import and requires review after a new upload", async () => {
        const failedId = randomUUID();
        const retryId = randomUUID();
        const csv = "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\n";
        const decisionFor = async (fileId: string) => ({
          columnMappings: {},
          rowDecisions: {
            "0": {
              reviewDecision: "correct-scope",
              decisionFileId: fileId,
              decisionToken: await tokenFor(fileId),
              scope: "1",
              decisionRef: "III.4.3",
              decisionScope: "Scope 3",
              decisionValue: 6300,
            },
          },
        });
        const createFile = (id: string) =>
          db.models.ImportedInventoryFile.create({
            id,
            userId: testUserID,
            cityId: testData.cityId,
            inventoryId,
            fileName: "retry.csv",
            originalFileName: "retry.csv",
            fileType: "csv",
            fileSize: Buffer.byteLength(csv),
            data: Buffer.from(csv),
            importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
            validationResults: {
              detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
            },
          });
        const submit = (
          id: string,
          mappingOverrides?: Record<string, unknown>,
        ) =>
          approveImport(mockRequest({ importedFileId: id, mappingOverrides }), {
            params: params(),
          });
        const waitForStatus = async (id: string) => {
          for (let i = 0; i < 100; i++) {
            const file = await db.models.ImportedInventoryFile.findByPk(id);
            if (
              file?.importStatus === ImportStatusEnum.COMPLETED ||
              file?.importStatus === ImportStatusEnum.FAILED
            )
              return file;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error("import worker did not finish");
        };
        await createFile(failedId);
        await db.sequelize!.query(`
          CREATE FUNCTION cc1201_test_reject_completion() RETURNS trigger AS $$
          BEGIN
            IF NEW.id = '${failedId}'::uuid AND NEW.import_status = 'completed' THEN
              RAISE EXCEPTION 'simulated completion failure';
            END IF;
            RETURN NEW;
          END; $$ LANGUAGE plpgsql;
          CREATE TRIGGER cc1201_test_reject_completion BEFORE UPDATE ON "ImportedInventoryFile"
          FOR EACH ROW EXECUTE FUNCTION cc1201_test_reject_completion();
        `);
        try {
          await expectStatusCode(
            await submit(failedId, await decisionFor(failedId)),
            202,
          );
          const failed = await waitForStatus(failedId);
          expect(failed.importStatus).toBe(ImportStatusEnum.FAILED);
          expect(failed.reviewHistory).toBeNull();
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(0);
          await createFile(retryId);
          await expectStatusCode(await submit(retryId), 409);
          await expectStatusCode(
            await submit(retryId, await decisionFor(retryId)),
            202,
          );
          const completed = await waitForStatus(retryId);
          expect(completed.importStatus).toBe(ImportStatusEnum.COMPLETED);
          expect(completed.reviewHistory?.rows).toHaveLength(1);
          await waitForCatalog(retryId);
        } finally {
          await db.sequelize!.query(
            'DROP TRIGGER IF EXISTS cc1201_test_reject_completion ON "ImportedInventoryFile"; DROP FUNCTION IF EXISTS cc1201_test_reject_completion();',
          );
          await db.models.ImportedInventoryFile.destroy({
            where: { id: [failedId, retryId] },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      }, 20000);

      it("rolls back all rows and history when one valid row fails to save", async () => {
        const csvId = randomUUID();
        const csv =
          "GPC ref. no.,Scope,Total CO2e\nIII.4.3,Scope 3,6300\nIII.4.2,3,42\n";
        await db.models.ImportedInventoryFile.create({
          id: csvId,
          userId: testUserID,
          cityId: testData.cityId,
          inventoryId,
          fileName: "row-failure.csv",
          originalFileName: "row-failure.csv",
          fileType: "csv",
          fileSize: Buffer.byteLength(csv),
          data: Buffer.from(csv),
          importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
          validationResults: {
            detectedColumns: { gpcRefNo: 0, scope: 1, totalCO2e: 2 },
          },
        });
        await db.sequelize!.query(`
          CREATE FUNCTION cc1201_test_reject_row() RETURNS trigger AS $$
          BEGIN
            IF NEW.inventory_id = '${inventoryId}'::uuid AND NEW.gpc_reference_number = 'III.4.2' THEN
              RAISE EXCEPTION 'simulated row failure';
            END IF;
            RETURN NEW;
          END; $$ LANGUAGE plpgsql;
          CREATE TRIGGER cc1201_test_reject_row BEFORE INSERT ON "InventoryValue"
          FOR EACH ROW EXECUTE FUNCTION cc1201_test_reject_row();
        `);
        try {
          const mappingOverrides = {
            columnMappings: {},
            rowDecisions: {
              "0": {
                reviewDecision: "correct-scope",
                decisionFileId: csvId,
                decisionToken: await tokenFor(csvId),
                scope: "1",
                decisionRef: "III.4.3",
                decisionScope: "Scope 3",
                decisionValue: 6300,
              },
            },
          };
          await expectStatusCode(
            await approveImport(
              mockRequest({ importedFileId: csvId, mappingOverrides }),
              { params: params() },
            ),
            202,
          );
          let file = await db.models.ImportedInventoryFile.findByPk(csvId);
          for (
            let i = 0;
            i < 100 && file?.importStatus === ImportStatusEnum.IMPORTING;
            i++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            file = await db.models.ImportedInventoryFile.findByPk(csvId);
          }
          expect(file?.importStatus).toBe(ImportStatusEnum.FAILED);
          expect(file?.reviewHistory).toBeNull();
          expect(
            await db.models.InventoryValue.count({ where: { inventoryId } }),
          ).toBe(0);
        } finally {
          await db.sequelize!.query(
            'DROP TRIGGER IF EXISTS cc1201_test_reject_row ON "InventoryValue"; DROP FUNCTION IF EXISTS cc1201_test_reject_row();',
          );
          await db.models.ImportedInventoryFile.destroy({
            where: { id: csvId },
          });
          await db.models.InventoryValue.destroy({ where: { inventoryId } });
        }
      }, 20000);

      it("accepts approval once the row has a decision", async () => {
        await expectStatusCode(
          await approve({
            "0": {
              reviewDecision: "keep",
              ...SEEN,
              decisionFileId: importedFileId,
              decisionToken: await tokenFor(importedFileId),
            },
          }),
          202,
        );
        // The route returns before importing. Wait for the worker before
        // afterAll removes the inventory it is writing to.
        let status: ImportStatusEnum | undefined;
        for (let i = 0; i < 100; i++) {
          status = (
            await db.models.ImportedInventoryFile.findByPk(importedFileId)
          )?.importStatus;
          if (
            status === ImportStatusEnum.COMPLETED ||
            status === ImportStatusEnum.FAILED
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(status).toBe(ImportStatusEnum.COMPLETED);
        await waitForCatalog(importedFileId);
      });
    });
  });

  it("keeps required units the same and ignores stored III.x.3", async () => {
    const inventory = await newInventory();
    const load = async () => {
      const loaded = await db.models.Inventory.findByPk(inventory.inventoryId, {
        include: [{ model: db.models.InventoryValue, as: "inventoryValues" }],
      });
      const { sectorProgress } =
        await InventoryProgressService.getInventoryProgress(loaded!);
      return sectorProgress.find(
        ({ sector }) => sector.referenceNumber === "III",
      )!;
    };

    const empty = await load();
    // III.x.1 and III.x.2 for four sub-sectors, as before the restore.
    expect(empty.total).toBe(8);
    expect(
      empty.subSectors.flatMap((subSector) =>
        subSector.subCategories.map((sub) => sub.referenceNumber),
      ),
    ).not.toEqual(expect.arrayContaining(["III.1.3"]));

    const imported = await ECRFImportService.fromExtractedRows(
      EXCLUDED_WASTE.map(extractedRow),
    );
    await InventoryImportService.importECRFData(
      inventory.inventoryId,
      imported,
      user.userId,
    );
    const filled = await load();
    expect(filled.total).toBe(8);
    expect(filled.uploaded).toBe(0);
    expect(filled.subSectors.map((s) => s.completedCount)).toEqual(
      empty.subSectors.map((s) => s.completedCount),
    );
  });
});
