/**
 * CC-1014: I.4.4 stays on the inventory and is left out of BASIC/BASIC+ totals.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import { getEmissionResults } from "@/backend/ResultsService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SubSector } from "@/models/SubSector";
import { Scope } from "@/models/init-models";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const PREFIX = "XX_CC1014_";

describe("reported totals omit grid generation", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subsector: SubSector;
  let scope: Scope;

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName: `${PREFIX}stationary`,
      referenceNumber: `${PREFIX}I`,
    });
    scope = await db.models.Scope.create({
      scopeId: randomUUID(),
      scopeName: "1",
    });
    subsector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: `${PREFIX}energy-industries`,
      scopeId: scope.scopeId,
      referenceNumber: `${PREFIX}I.4`,
    });
    await db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId: inventory.inventoryId,
      sectorId: sector.sectorId,
      subSectorId: subsector.subsectorId,
      gpcReferenceNumber: "I.1.1",
      co2eq: 1000n,
    });
    await db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId: inventory.inventoryId,
      sectorId: sector.sectorId,
      subSectorId: subsector.subsectorId,
      gpcReferenceNumber: "I.4.4",
      co2eq: 500n,
    });
  });

  afterAll(async () => {
    if (inventory?.inventoryId) {
      await db.models.InventoryValue.destroy({
        where: { inventoryId: inventory.inventoryId },
      });
      await db.models.Inventory.destroy({
        where: { inventoryId: inventory.inventoryId },
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
    if (scope?.scopeId) {
      await db.models.Scope.destroy({ where: { scopeId: scope.scopeId } });
    }
    if (city?.cityId) {
      await db.models.City.destroy({ where: { cityId: city.cityId } });
    }
    if (db.sequelize) {
      await db.sequelize.close();
    }
  });

  it("keeps I.4.4 stored and leaves it out of the stationary and city total", async () => {
    const stored = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: inventory.inventoryId,
        gpcReferenceNumber: "I.4.4",
      },
    });
    expect(stored).not.toBeNull();
    expect(BigInt(stored!.co2eq as unknown as string)).toBe(500n);

    const results = await getEmissionResults(inventory.inventoryId);
    expect(results.totalEmissions.toNumber()).toBe(1000);
    expect(results.totalEmissionsBySector).toHaveLength(1);
    expect(results.totalEmissionsBySector![0].co2eq.toNumber()).toBe(1000);
  });
});
