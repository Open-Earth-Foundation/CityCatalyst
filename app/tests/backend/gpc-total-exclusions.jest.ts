/**
 * CC-1201: III.x.3 and VI.1 stay stored and visible, and BASIC/BASIC+ totals
 * leave them out on every write path and every aggregate surface.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { QueryTypes } from "sequelize";
import { GET as getCityDashboard } from "@/app/api/v1/city/[city]/dashboard/route";
import { GET as getCityInventories } from "@/app/api/v1/city/[city]/inventory/route";
import { GET as downloadInventory } from "@/app/api/v1/inventory/[inventory]/download/route";
import { GET as getSectorResults } from "@/app/api/v1/inventory/[inventory]/results/[sectorName]/route";
import { GET as getResults } from "@/app/api/v1/inventory/[inventory]/results/route";
import { PATCH as saveSubSectorValue } from "@/app/api/v1/inventory/[inventory]/value/subsector/[subsector]/route";
import {
  GET as getSubCategoryValue,
  PATCH as saveSubCategoryValue,
} from "@/app/api/v1/inventory/[inventory]/value/[subcategory]/route";
import { GET as getProjectSummary } from "@/app/api/v1/projects/[project]/summary/route";
import { GET as getPublicInventories } from "@/app/api/v1/public/city/[cityId]/inventories/route";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import InventoryImportService from "@/backend/InventoryImportService";
import { InventoryService } from "@/backend/InventoryService";
import { ResourceLoader } from "@/backend/permissions/ResourceLoader";
import {
  getEmissionResults,
  getEmissionResultsBatch,
  getTotalEmissionsBySectorAndSubsector,
} from "@/backend/ResultsService";
import VersionHistoryService from "@/backend/VersionHistoryService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { InventoryValue } from "@/models/InventoryValue";
import { Scope } from "@/models/init-models";
import { Sector } from "@/models/Sector";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";
import { cdpEmissionsRows } from "@/util/cdp-emissions-crosswalk";
import {
  GlobalWarmingPotentialTypeEnum,
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

const PREFIX = "XX_CC1201_";
const EXCLUDED = ["III.1.3", "III.2.3", "III.3.3", "III.4.3", "VI.1"];
const INCLUDED = ["III.1.1", "III.1.2", "III.4.2"];
const TONNE = 1000n;

describe("GPC references left out of BASIC/BASIC+ totals", () => {
  let testData: TestData;
  let scope1: Scope;
  let waste: Sector;
  let otherScope3: Sector;
  let solidWaste: SubSector;
  let otherScope3Sub: SubSector;
  let importedWaste: SubCategory;
  const inventoryIds: string[] = [];

  async function newInventory(isPublic = false): Promise<Inventory> {
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: testData.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      isPublic,
    });
    inventoryIds.push(inventory.inventoryId);
    return inventory;
  }

  function addValue(
    inventoryId: string,
    gpcReferenceNumber: string,
    co2eq: bigint | undefined,
    extra: Partial<InventoryValue> = {},
  ): Promise<InventoryValue> {
    const isOther = gpcReferenceNumber.startsWith("VI");
    return db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId,
      sectorId: isOther ? otherScope3.sectorId : waste.sectorId,
      subSectorId: isOther
        ? otherScope3Sub.subsectorId
        : solidWaste.subsectorId,
      subCategoryId:
        gpcReferenceNumber === "III.4.3"
          ? importedWaste.subcategoryId
          : undefined,
      gpcReferenceNumber,
      co2eq,
      ...extra,
    });
  }

  /** Writes around the model hook, as data stored before this rule would look. */
  async function clearFlag(id: string): Promise<void> {
    await db.sequelize!.query(
      `UPDATE "InventoryValue" SET omit_from_total = false WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE },
    );
  }

  function importFile(gpcRefNo: string, totalCO2e: number): ECRFImportResult {
    return {
      rows: [
        {
          gpcRefNo,
          sectorId: gpcRefNo.startsWith("VI")
            ? otherScope3.sectorId
            : waste.sectorId,
          subsectorId: gpcRefNo.startsWith("VI")
            ? otherScope3Sub.subsectorId
            : solidWaste.subsectorId,
          subcategoryId: null,
          scopeId: scope1.scopeId,
          rowIndex: 0,
          totalCO2e,
          methodology: "direct-measure",
        },
      ],
      errors: [],
      warnings: [],
      rowCount: 1,
      validRowCount: 1,
    } as unknown as ECRFImportResult;
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData({
      cityName: `${PREFIX}city`,
      countryLocode: "XX",
      organizationName: `${PREFIX}org`,
      projectName: `${PREFIX}project`,
    });
    const city = await db.models.City.findByPk(testData.cityId);
    await city!.update({ locode: `XX ${randomUUID().slice(0, 8)}` });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city!.addUser(testUserID);

    // The seeded catalogue: review round 1 found fabricated rows hid a rejected reference.
    waste = (await db.models.Sector.findOne({
      where: { referenceNumber: "III" },
    }))!;
    otherScope3 = (await db.models.Sector.findOne({
      where: { referenceNumber: "VI" },
    }))!;
    solidWaste = (await db.models.SubSector.findOne({
      where: { referenceNumber: "III.1" },
    }))!;
    otherScope3Sub = (await db.models.SubSector.findOne({
      where: { referenceNumber: "VI.1" },
    }))!;
    importedWaste = (await db.models.SubCategory.findOne({
      where: { referenceNumber: "III.4.3" },
    }))!;
    scope1 = (await db.models.Scope.findByPk(importedWaste.scopeId))!;
  });

  afterAll(async () => {
    await db.models.Version.destroy({ where: { inventoryId: inventoryIds } });
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventoryIds },
    });
    await db.models.Inventory.destroy({ where: { inventoryId: inventoryIds } });
    await cleanupTestData(testData);
    teardownTests();
    if (db.sequelize) await db.sequelize.close();
  });

  describe("model save", () => {
    it.each(EXCLUDED)("flags %s on create", async (ref) => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, ref, 10n);
      await value.reload();
      expect(value.omitFromTotal).toBe(true);
    });

    it.each(EXCLUDED)("flags a stored %s on update", async (ref) => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, ref, 10n);
      await clearFlag(value.id);
      await value.reload();
      expect(value.omitFromTotal).toBe(false);

      await value.update({ co2eq: 20n });
      await value.reload();
      expect(value.omitFromTotal).toBe(true);
      expect(BigInt(value.co2eq as unknown as string)).toBe(20n);
    });

    it("keeps flagging I.4.4", async () => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, "I.4.4", 10n);
      await value.reload();
      expect(value.omitFromTotal).toBe(true);
    });

    it.each([...INCLUDED, "III.1.30", "III.X.3", "VI", "VI.1.1", "vi.1"])(
      "leaves %s in totals",
      async (ref) => {
        const { inventoryId } = await newInventory();
        const value = await addValue(inventoryId, ref, 10n);
        await value.update({ co2eq: 20n });
        await value.reload();
        expect(value.omitFromTotal).toBe(false);
      },
    );

    it("keeps an explicit flag on any other reference", async () => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, "III.1.1", 10n, {
        omitFromTotal: true,
      });
      await value.update({ co2eq: 20n });
      await value.reload();
      expect(value.omitFromTotal).toBe(true);
    });
  });

  describe("write paths", () => {
    it.each(EXCLUDED)("import creates and re-imports %s", async (ref) => {
      const { inventoryId } = await newInventory();
      const first = await InventoryImportService.importECRFData(
        inventoryId,
        importFile(ref, 2),
        testUserID,
      );
      expect(first.errors).toEqual([]);
      const created = await db.models.InventoryValue.findOne({
        where: { inventoryId, gpcReferenceNumber: ref },
      });
      expect(created!.omitFromTotal).toBe(true);

      // A row stored before this rule, then a second file row on the same value.
      await clearFlag(created!.id);
      await InventoryImportService.importECRFData(
        inventoryId,
        importFile(ref, 3),
        testUserID,
      );
      await created!.reload();
      expect(created!.omitFromTotal).toBe(true);
      expect(BigInt(created!.co2eq as unknown as string)).toBe(5n * TONNE);
    });

    it("import leaves an included neighbor in totals", async () => {
      const { inventoryId } = await newInventory();
      await InventoryImportService.importECRFData(
        inventoryId,
        importFile("III.1.2", 2),
        testUserID,
      );
      const created = await db.models.InventoryValue.findOne({
        where: { inventoryId, gpcReferenceNumber: "III.1.2" },
      });
      expect(created!.omitFromTotal).toBe(false);
    });

    it("manual subcategory save flags the row and it stays readable", async () => {
      const { inventoryId } = await newInventory();
      const context = {
        params: Promise.resolve({
          inventory: inventoryId,
          subcategory: importedWaste.subcategoryId,
        }),
      };
      const save = await saveSubCategoryValue(
        mockRequest({ co2eq: 608000n, activityValue: 1, activityUnits: "t" }),
        context,
      );
      await expectStatusCode(save, 200);

      const read = await getSubCategoryValue(mockRequest(), context);
      await expectStatusCode(read, 200);
      const { data } = await read.json();
      expect(data.gpcReferenceNumber).toBe("III.4.3");
      expect(data.omitFromTotal).toBe(true);
      expect(String(data.co2eq)).toBe("608000");
    });

    it("manual subsector save flags VI.1 on create and update", async () => {
      const { inventoryId } = await newInventory();
      const context = {
        params: Promise.resolve({
          inventory: inventoryId,
          subsector: otherScope3Sub.subsectorId,
        }),
      };
      const body = {
        gpcReferenceNumber: "VI.1",
        activityValue: 1,
        activityUnits: "t",
      };
      await expectStatusCode(
        await saveSubSectorValue(mockRequest(body), context),
        200,
      );
      const created = await db.models.InventoryValue.findOne({
        where: { inventoryId, gpcReferenceNumber: "VI.1" },
      });
      expect(created!.omitFromTotal).toBe(true);

      await clearFlag(created!.id);
      await expectStatusCode(
        await saveSubSectorValue(
          mockRequest({ ...body, activityValue: 2 }),
          context,
        ),
        200,
      );
      await created!.reload();
      expect(created!.omitFromTotal).toBe(true);
    });

    it("version restore cannot put an excluded row back in totals", async () => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, "VI.1", 10n);
      // Snapshots taken before this rule hold a false flag.
      const before = {
        ...value.toJSON(),
        omitFromTotal: false,
      };
      const first = await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        value.id,
        testUserID,
        before,
      );
      await VersionHistoryService.createVersion(
        inventoryId,
        "InventoryValue",
        value.id,
        testUserID,
        { ...before, co2eq: "20" },
      );

      await VersionHistoryService.restoreVersion(first!.versionId, inventoryId);

      await value.reload();
      expect(value.omitFromTotal).toBe(true);
    });
  });

  describe("reported totals", () => {
    let inventory: Inventory;

    // Net 1,150 t: 1,000 + 200 - 50. VI.1 and III.4.3 are the issue's cases.
    const NET_KG = 1_150_000;
    const GROSS_KG = 1_200_000;

    beforeAll(async () => {
      inventory = await newInventory(true);
      const { inventoryId } = inventory;
      await addValue(inventoryId, "III.1.1", 1000n * TONNE);
      await addValue(inventoryId, "III.1.2", 200n * TONNE);
      await addValue(inventoryId, "III.4.2", -50n * TONNE);
      await addValue(inventoryId, "VI.1", 1_188_394n * TONNE);
      await addValue(inventoryId, "III.4.3", 608n * TONNE);
      await addValue(inventoryId, "III.2.3", -7n * TONNE);
    });

    it("getEmissionResults leaves the rows out", async () => {
      const results = await getEmissionResults(inventory.inventoryId);
      expect(results.totalEmissions.toNumber()).toBe(NET_KG);
      expect(results.grossEmissions!.toNumber()).toBe(GROSS_KG);
      expect(results.removals!.toNumber()).toBe(-50_000);
      expect(results.totalEmissionsBySector).toHaveLength(1);
      expect(results.totalEmissionsBySector![0].co2eq.toNumber()).toBe(NET_KG);
      expect(results.totalEmissionsBySector![0].percentage).toBe(100);
      expect(
        results.topEmissionsBySubSector!.map((e) => e.co2eq.toNumber()),
      ).not.toContain(1_188_394_000);
    });

    it("results route matches", async () => {
      const res = await getResults(mockRequest(), {
        params: Promise.resolve({ inventory: inventory.inventoryId }),
      });
      await expectStatusCode(res, 200);
      const { data } = await res.json();
      expect(Number(data.totalEmissions.total)).toBe(NET_KG);
    });

    it("subsector totals behind forecasts match", async () => {
      const rows = await getTotalEmissionsBySectorAndSubsector(
        inventory.inventoryId,
      );
      const sum = rows.reduce((acc, row) => acc + BigInt(row.co2eq), 0n);
      expect(sum).toBe(1200n * TONNE);
    });

    it("inventory, city, dashboard, project and public totals match", async () => {
      const { inventoryId } = inventory;
      const service =
        await InventoryService.getInventoryWithTotalEmissions(inventoryId);
      expect(Number(service.totalEmissions)).toBe(NET_KG);

      const loaded = await ResourceLoader.getResource({ inventoryId });
      expect(Number((loaded as Inventory).totalEmissions)).toBe(NET_KG);

      const city = await getCityInventories(mockRequest(), {
        params: Promise.resolve({ city: testData.cityId }),
      });
      await expectStatusCode(city, 200);
      const cityRows = (await city.json()).data;
      expect(
        Number(
          cityRows.find(
            (row: { inventoryId: string }) => row.inventoryId === inventoryId,
          ).totalEmissions,
        ),
      ).toBe(NET_KG);

      const dashboard = await getCityDashboard(mockRequest(), {
        params: Promise.resolve({ city: testData.cityId }),
      });
      await expectStatusCode(dashboard, 200);
      const dashboardBody = JSON.stringify(await dashboard.json());
      expect(dashboardBody).not.toContain("1189544");

      const publicRes = await getPublicInventories(mockRequest(), {
        params: Promise.resolve({ cityId: testData.cityId }),
      });
      await expectStatusCode(publicRes, 200);
      const publicRows = (await publicRes.json()).data;
      expect(
        Number(
          publicRows.find(
            (row: { inventoryId: string }) => row.inventoryId === inventoryId,
          ).totalEmissions,
        ),
      ).toBe(NET_KG);
    });

    it("project summary sums without the rows", async () => {
      const isolated = await createTestData({
        cityName: `${PREFIX}summary-city`,
        countryLocode: "XX",
      });
      const summaryInventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        cityId: isolated.cityId,
        inventoryName: `${PREFIX}summary`,
        year: 2022,
      });
      await addValue(summaryInventory.inventoryId, "III.1.1", 1000n * TONNE);
      await addValue(summaryInventory.inventoryId, "VI.1", 5n * TONNE);
      try {
        const res = await getProjectSummary(mockRequest(), {
          params: Promise.resolve({ project: isolated.projectId }),
        });
        await expectStatusCode(res, 200);
        const summary = await res.json();
        expect(Number(summary.totalEmissions)).toBe(1_000_000);
      } finally {
        await db.models.InventoryValue.destroy({
          where: { inventoryId: summaryInventory.inventoryId },
        });
        await summaryInventory.destroy();
        await cleanupTestData(isolated);
      }
    });

    it("CDP keeps BASIC and territorial scope 1 apart", () => {
      const row = (title: string) =>
        cdpEmissionsRows.find((entry) => entry.rowRegex.test(title))!.refNos;
      const basic = row("TOTAL BASIC emissions");
      for (const ref of EXCLUDED) {
        expect(basic).not.toContain(ref);
      }
      for (const ref of ["III.1.3", "III.2.3", "III.3.3", "III.4.3"]) {
        expect(row("Total scope 1 emissions (excluding generation)")).toContain(
          ref,
        );
      }
    });

    it("sector breakdown shows the rows apart from the counted ones", async () => {
      const res = await getSectorResults(mockRequest(), {
        params: Promise.resolve({
          inventory: inventory.inventoryId,
          sectorName: "waste",
        }),
      });
      await expectStatusCode(res, 200);
      const { data } = await res.json();

      expect(Number(data.grossTotalEmissions)).toBe(GROSS_KG);
      const counted = data.byScope.reduce(
        (sum: number, row: { totalEmissions: string }) =>
          sum + Number(row.totalEmissions),
        0,
      );
      expect(counted).toBe(NET_KG);
      for (const row of data.byScope) {
        expect(row.percentage === null || row.percentage <= 100).toBe(true);
      }

      const omitted = Object.fromEntries(
        data.omittedFromTotal.map(
          (row: { gpcReferenceNumber: string; totalEmissions: string }) => [
            row.gpcReferenceNumber,
            Number(row.totalEmissions),
          ],
        ),
      );
      expect(omitted).toEqual({ "III.2.3": -7000, "III.4.3": 608_000 });
      const title = (ref: string) =>
        data.omittedFromTotal.find(
          (row: { gpcReferenceNumber: string }) =>
            row.gpcReferenceNumber === ref,
        ).activityTitle;
      expect(title("III.4.3")).toBe(importedWaste.subcategoryName);
      // A row with no subcategory link falls back to the sub-sector name.
      expect(title("III.2.3")).toBe(solidWaste.subsectorName);
      expect(data.omittedFromTotal[0].percentage).toBeNull();
    });

    it("downloads keep every stored row", async () => {
      const context = {
        params: Promise.resolve({ inventory: inventory.inventoryId }),
      };
      const json = await downloadInventory(
        mockRequest(undefined, { format: "json" }),
        context,
      );
      await expectStatusCode(json, 200);
      const { data } = await json.json();
      const refs = data.inventoryValues.map(
        (value: InventoryValue) => value.gpcReferenceNumber,
      );
      expect(refs).toEqual(expect.arrayContaining(["VI.1", "III.4.3"]));

      const csv = await downloadInventory(
        mockRequest(undefined, { format: "csv" }),
        context,
      );
      await expectStatusCode(csv, 200);
      const csvText = await csv.text();
      expect(csvText).toContain("VI.1");
      expect(csvText).toContain("III.4.3");
      expect(csvText).toContain("1188394");
    });

    it("eCRF keeps III.x.3 on its own row", async () => {
      const res = await downloadInventory(
        mockRequest(undefined, { format: "ecrf" }),
        { params: Promise.resolve({ inventory: inventory.inventoryId }) },
      );
      await expectStatusCode(res, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await res.arrayBuffer());
      const sheet = workbook.getWorksheet(2)!;
      // III.4.3 on the wastewater row, III.x.1 and III.x.2 unchanged
      expect(sheet.getCell("F20").value).toBe(608);
      expect(sheet.getCell("D17").value).toBe(200);
    });

    it("batch results keep I.4.4 out", async () => {
      const { inventoryId } = await newInventory();
      await addValue(inventoryId, "III.1.1", 3n * TONNE);
      await addValue(inventoryId, "I.4.4", 2n * TONNE);
      const batch = await getEmissionResultsBatch([inventoryId]);
      expect(batch[inventoryId].totalEmissions.sumOfEmissions.toNumber()).toBe(
        3000,
      );
    });
  });

  describe("inventories with nothing to count", () => {
    it("only excluded rows report no total and keep the rows", async () => {
      const { inventoryId } = await newInventory(true);
      await addValue(inventoryId, "III.1.3", 5n * TONNE);
      await addValue(inventoryId, "VI.1", 6n * TONNE);

      const res = await getResults(mockRequest(), {
        params: Promise.resolve({ inventory: inventoryId }),
      });
      await expectStatusCode(res, 200);
      const { data } = await res.json();
      expect(Number(data.totalEmissions.total)).toBe(0);
      expect(data.totalEmissions.bySector).toEqual([]);
      expect(data.topEmissions.bySubSector).toEqual([]);

      const service =
        await InventoryService.getInventoryWithTotalEmissions(inventoryId);
      expect(service.totalEmissions).toBeNull();

      const breakdown = await getSectorResults(mockRequest(), {
        params: Promise.resolve({
          inventory: inventoryId,
          sectorName: "waste",
        }),
      });
      const { data: sector } = await breakdown.json();
      expect(sector.byScope).toEqual([]);
      expect(Number(sector.grossTotalEmissions)).toBe(0);
      expect(sector.omittedFromTotal).toHaveLength(1);
    });

    it("an empty inventory stays empty", async () => {
      const { inventoryId } = await newInventory();
      const results = await getEmissionResults(inventoryId);
      expect(results.totalEmissions).toBeUndefined();
    });
  });

  describe("CO2(b)", () => {
    it("a stored CO2(b) gas value does not change a total", async () => {
      const { inventoryId } = await newInventory();
      const value = await addValue(inventoryId, "III.1.1", 3n * TONNE);
      await db.models.GasValue.create({
        id: randomUUID(),
        inventoryValueId: value.id,
        gas: "CO2(b)",
        gasAmount: 9n * TONNE,
      });
      const results = await getEmissionResults(inventoryId);
      expect(results.totalEmissions.toNumber()).toBe(3000);
    });
  });
});
