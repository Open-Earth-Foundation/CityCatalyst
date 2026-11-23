/**
 * CC-1311: subsector-level values (`I.3` with no scope split) on the real
 * catalogue built by the migrations and the GPC seeder.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import ECRFImportService, {
  supersedeParentsWithChildren,
} from "@/backend/ECRFImportService";
import type { ParsedFileData } from "@/backend/FileParserService";
import InventoryImportService from "@/backend/InventoryImportService";
import {
  getEmissionResults,
  getEmissionsBreakdown,
} from "@/backend/ResultsService";
import { db } from "@/models";
import type { City } from "@/models/City";
import type { User } from "@/models/User";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const PREFIX = "XX_CC1311_";

const row = (gpcRefNo: string, totalCO2e: number, omitFromTotal?: boolean) => ({
  year: 2022,
  sector: null,
  subsector: null,
  category: null,
  gpcRefNo,
  totalCO2e,
  ...(omitFromTotal ? { omitFromTotal } : {}),
});

describe("subsector-level GPC references", () => {
  let city: City;
  let user: User;
  const inventoryIds: string[] = [];

  async function importRows(rows: ReturnType<typeof row>[]) {
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    inventoryIds.push(inventory.inventoryId);
    const extracted = await ECRFImportService.fromExtractedRows(rows);
    const summary = await InventoryImportService.importECRFData(
      inventory.inventoryId,
      extracted,
      user.userId,
    );
    return { inventoryId: inventory.inventoryId, extracted, summary };
  }

  const stored = (inventoryId: string) =>
    db.models.InventoryValue.findAll({ where: { inventoryId } });

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

  it("resolves a sector I-III subsector reference with no scope", async () => {
    for (const ref of ["I.3", "II.1", "III.1"]) {
      const mapping = await ECRFImportService.lookupGPCReference(ref);
      expect(mapping).not.toBeNull();
      expect(mapping!.subcategoryId).toBeNull();
      expect(mapping!.scopeId).toBeNull();
    }
  });

  it("keeps the subsector scope for sectors IV-V", async () => {
    for (const ref of ["IV.1", "V.1"]) {
      const mapping = await ECRFImportService.lookupGPCReference(ref);
      expect(mapping).not.toBeNull();
      expect(typeof mapping!.scopeId).toBe("string");
      expect(mapping!.scopeId).not.toBe("");
    }
  });

  it("still rejects a reference that is not in the taxonomy", async () => {
    expect(await ECRFImportService.lookupGPCReference("I.9")).toBeNull();
  });

  it("approve stores a subsector-level value", async () => {
    const { inventoryId, summary } = await importRows([row("I.3", 500)]);
    expect(summary.errors).toEqual([]);
    const values = await stored(inventoryId);
    expect(values).toHaveLength(1);
    expect(values[0].gpcReferenceNumber).toBe("I.3");
    expect(values[0].subSectorId).toBeTruthy();
    expect(values[0].subCategoryId).toBeNull();
    expect(BigInt(values[0].co2eq as unknown as string)).toBe(500_000n);
  });

  it("stores only the children when parent and children come together", async () => {
    const { inventoryId } = await importRows([
      row("I.3", 500),
      row("I.3.1", 300),
      row("I.3.2", 200),
    ]);
    const refs = (await stored(inventoryId))
      .map((v) => v.gpcReferenceNumber)
      .sort();
    expect(refs).toEqual(["I.3.1", "I.3.2"]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(500_000);
  });

  it("results total skips rows marked excluded", async () => {
    const { inventoryId } = await importRows([
      row("I.1.1", 100),
      row("I.2.1", 50, true),
    ]);
    const values = await stored(inventoryId);
    const flag = Object.fromEntries(
      values.map((v) => [v.gpcReferenceNumber, v.omitFromTotal]),
    );
    expect(flag).toEqual({ "I.1.1": false, "I.2.1": true });
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(100_000);
  });

  it("an import of only subsector rows stores them", async () => {
    const { inventoryId, extracted } = await importRows([
      row("I.1", 10),
      row("I.2", 20),
      row("II.1", 30),
      row("III.1", 40),
    ]);
    expect(extracted.validRowCount).toBe(4);
    expect(await stored(inventoryId)).toHaveLength(4);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(100_000);
  });

  it("sector and scope breakdown with an unsplit I.3 row", async () => {
    const { inventoryId } = await importRows([
      row("I.3", 500),
      row("I.1.1", 100),
      row("IV.1", 50),
    ]);
    const results = await getEmissionResults(inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(650_000);
    const energy = await getEmissionsBreakdown(
      inventoryId,
      "stationary-energy",
    );
    expect(energy.grossTotalEmissions.toNumber()).toBe(600_000);
    // The unsplit row counts in the sector total but in no scope column:
    // the results table only draws scopes 1, 2 and 3.
    const unsplit = energy.byScope.find(
      (r) => r.totalEmissions.toString() === "500000",
    )!;
    expect(
      Object.keys(unsplit.scopes).filter((k) => /^[123]$/.test(k)),
    ).toEqual([]);
    // The table shows IE for it (GPC Table 2.1), not 0.
    expect(unsplit.unsplitReferences).toEqual(["I.3"]);
    expect(Object.keys(unsplit.scopes)).toEqual([]);
    const scoped = energy.byScope.find(
      (r) => r.totalEmissions.toString() === "100000",
    )!;
    expect(scoped.unsplitReferences ?? []).toEqual([]);
  });

  it("an eCRF sheet with a subsector subtotal keeps only its children", async () => {
    const headers = ["GPC ref. no.", "Total CO2e"];
    const data = [
      ["I.3", 500],
      ["I.3.1", 300],
      ["I.3.2", 200],
    ] as const;
    const sheet = {
      name: "Inventory",
      headers,
      rows: data.map(([ref, t]) => ({ [headers[0]]: ref, [headers[1]]: t })),
      rowNumbers: data.map((_, i) => i + 2),
    };
    const processed = await ECRFImportService.processECRFFile(
      { primarySheet: sheet, sheets: [sheet] } as unknown as ParsedFileData,
      { gpcRefNo: 0, totalCO2e: 1 },
    );
    const parent = processed.rows.find((r) => r.gpcRefNo === "I.3")!;
    expect(parent.issue).toBe("gpc-parent-superseded");
    expect(processed.validRowCount).toBe(2);
  });

  it("re-running the rule restores a parent whose children moved away", async () => {
    const extracted = await ECRFImportService.fromExtractedRows([
      row("I.3", 500),
      row("I.3.1", 500),
    ]);
    const parent = extracted.rows.find((r) => r.gpcRefNo === "I.3")!;
    expect(parent.issue).toBe("gpc-parent-superseded");

    // A review decision moves the only child to another subsector.
    const moved = await ECRFImportService.lookupGPCReference("I.4.1");
    const child = extracted.rows.find((r) => r.gpcRefNo === "I.3.1")!;
    Object.assign(child, {
      gpcRefNo: "I.4.1",
      subsectorId: moved!.subsectorId,
      subcategoryId: moved!.subcategoryId,
    });
    supersedeParentsWithChildren(extracted.rows, extracted.warnings);
    expect(parent.issue).toBeUndefined();
    expect(parent.errors).toBeUndefined();
    expect(parent.parentSuperseded).toBeUndefined();
  });
});
