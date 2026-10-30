/**
 * CC-1201: the backfill flags stored III.x.3 and VI.1 rows only, can run twice,
 * and its rollback never clears a flag.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import env from "@next/env";
import { QueryTypes } from "sequelize";
import { getEmissionResults } from "@/backend/ResultsService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const require = createRequire(import.meta.url);
const migration = require("../../migrations/20261030120000-inventory-value-omit-gpc-excluded-refs.cjs");

const PREFIX = "XX_CC1201B_";
const REFS = ["III.1.3", "III.2.3", "III.3.3", "III.4.3", "VI.1"];

describe("omit_from_total backfill", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;

  /** Inserts directly: stored history did not pass through the current hook. */
  async function insertRow(ref: string, flag: boolean): Promise<string> {
    const id = randomUUID();
    await db.sequelize!.query(
      `INSERT INTO "InventoryValue"
         (id, inventory_id, sector_id, gpc_reference_number, co2eq,
          omit_from_total, created, last_updated)
       VALUES (:id, :inventoryId, :sectorId, :ref, 1000, :flag, NOW(), NOW())`,
      {
        replacements: {
          id,
          inventoryId: inventory.inventoryId,
          sectorId: sector.sectorId,
          ref,
          flag,
        },
        type: QueryTypes.INSERT,
      },
    );
    return id;
  }

  async function flags(): Promise<Record<string, boolean>> {
    const rows = (await db.sequelize!.query(
      `SELECT id, omit_from_total FROM "InventoryValue"
       WHERE inventory_id = :inventoryId`,
      {
        replacements: { inventoryId: inventory.inventoryId },
        type: QueryTypes.SELECT,
      },
    )) as { id: string; omit_from_total: boolean }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.omit_from_total]));
  }

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
      sectorName: `${PREFIX}waste`,
      referenceNumber: `${PREFIX}III`,
    });
  });

  afterAll(async () => {
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });
    await inventory?.destroy();
    await sector?.destroy();
    await city?.destroy();
    if (db.sequelize) await db.sequelize.close();
  });

  it("flags only the five references and survives a repeat and rollback", async () => {
    const stale = await Promise.all(
      REFS.filter((ref) => ref !== "III.4.3").map((ref) =>
        insertRow(ref, false),
      ),
    );
    const alreadyTrue = await insertRow("III.4.3", true);
    const grid = await insertRow("I.4.4", true);
    const explicit = await insertRow("I.1.1", true);
    const included = await Promise.all(
      ["III.1.1", "III.1.2", "III.4.2", "III.1.30", "VI"].map((ref) =>
        insertRow(ref, false),
      ),
    );

    const before = await getEmissionResults(inventory.inventoryId);
    expect(before.totalEmissions.toNumber()).toBe(9000);

    const queryInterface = db.sequelize!.getQueryInterface();
    await migration.up(queryInterface);
    await migration.up(queryInterface);

    const afterUp = await flags();
    for (const id of [...stale, alreadyTrue, grid, explicit]) {
      expect(afterUp[id]).toBe(true);
    }
    for (const id of included) {
      expect(afterUp[id]).toBe(false);
    }
    const after = await getEmissionResults(inventory.inventoryId);
    expect(after.totalEmissions.toNumber()).toBe(5000);

    await migration.down(queryInterface);
    expect(await flags()).toEqual(afterUp);
  });
});
