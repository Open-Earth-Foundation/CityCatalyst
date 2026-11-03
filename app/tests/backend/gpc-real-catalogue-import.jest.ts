/**
 * CC-1201: III.x.3 and VI.1 reach the database through real import, on the
 * catalogue built by the migrations and the GPC seeder. This suite creates no
 * catalogue rows on purpose: review round 1 found that fabricated rows hid a
 * rejected reference.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
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
} from "@/backend/ImportRowPreviewService";
import InventoryImportService from "@/backend/InventoryImportService";
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
    const SEEN = { decisionRef: "III.4.3", decisionValue: 6300 };
    const WASTEWATER = {
      year: 2022,
      sector: "Waste",
      subsector: "Wastewater Treatment And Discharge",
      category: "Wastewater Treatment & Discharge",
      totalCO2e: 6300,
    };

    function pdfResult(
      rows: Record<string, unknown>[],
      overrides?: Record<string, unknown>,
    ) {
      return buildImportResult(
        {
          id: randomUUID(),
          fileType: "pdf",
          mappingConfiguration: { rows },
          validationResults: {},
        } as never,
        overrides,
      ).then(({ importResult }) => importResult);
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

      it("rejects a forged decision", async () => {
        await expectStatusCode(
          await approve({ "0": { reviewDecision: "confirmed" } }),
          409,
        );
      });

      it("accepts approval once the row has a decision", async () => {
        await expectStatusCode(
          await approve({ "0": { reviewDecision: "keep", ...SEEN } }),
          202,
        );
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
