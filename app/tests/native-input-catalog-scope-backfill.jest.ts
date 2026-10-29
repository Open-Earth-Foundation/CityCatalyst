import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import {
  backfillCatalogScopePage,
  runCatalogScopeBackfill,
} from "@/backend/NativeInputCatalogScopeBackfill";
import { db } from "@/models";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { baseInventory } from "./api/results.data";
import { setupTests } from "./helpers";
import {
  cleanupTestData,
  createTestData,
  type TestData,
} from "./helpers/testDataCreationHelper";

// CC-1060 PR 2 backfill: fill a missing projectId and write nothing else (userId is preserved),
// fill the missing projectId. Runs against the local test database only.

describe("native input catalog scope backfill", () => {
  let tenant: TestData;
  const inventoryId = randomUUID();
  const creatorId = randomUUID();
  const catalogIds: string[] = [];
  const keys: Record<string, string> = {};

  async function row(
    key: string,
    attributes: Partial<{
      owningModule: string;
      kind: string;
      sourceType: string;
      userId: string | null;
      inventoryId: string | null;
      cityId: string | null;
      projectId: string | null;
      organizationId: string | null;
    }>,
  ) {
    const created = await db.models.NativeInputCatalog.create({
      owningModule: "hiap",
      kind: "hiap_ranking",
      sourceType: "hiap_ranking",
      sourceId: `cc1060-backfill:${key}:${randomUUID()}`,
      availability: "active",
      userId: null,
      inventoryId: null,
      cityId: null,
      projectId: null,
      organizationId: null,
      ...attributes,
    });
    catalogIds.push(created.id);
    keys[key] = created.id;
  }

  const load = async (key: string) =>
    (await db.models.NativeInputCatalog.findByPk(keys[key]))!.get({
      plain: true,
    });

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    tenant = await createTestData({ cityName: "Backfill City" });
    await db.models.User.create({
      userId: creatorId,
      name: "backfill-creator",
    });
    await db.models.Inventory.create({
      inventoryId,
      ...baseInventory,
      inventoryName: `cc1060-backfill-${inventoryId.slice(0, 8)}`,
      cityId: tenant.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2022,
      isPublic: false,
    });

    await row("hiap-legacy", {
      userId: creatorId,
      inventoryId,
      cityId: tenant.cityId,
    });
    await row("hiap-inventory-only", { userId: creatorId, inventoryId });
    await row("meed-legacy", {
      owningModule: "hiap_meed",
      kind: "hiap_meed_ranking",
      sourceType: "hiap_meed_ranking",
      userId: creatorId,
      inventoryId,
      cityId: tenant.cityId,
    });
    await row("ghgi-upload", {
      owningModule: "ghgi",
      kind: "inventory_file",
      sourceType: "imported_file",
      userId: creatorId,
      cityId: tenant.cityId,
    });
    await row("clean", {
      inventoryId,
      cityId: tenant.cityId,
      projectId: tenant.projectId,
      organizationId: tenant.organizationId,
    });
    await row("unresolved", { organizationId: tenant.organizationId });
  });

  afterAll(async () => {
    await db.models.NativeInputCatalog.destroy({
      where: { id: { [Op.in]: catalogIds } },
    });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await cleanupTestData(tenant);
    await db.models.User.destroy({ where: { userId: creatorId } });
  });

  it("changes nothing in a dry run", async () => {
    const before = await Promise.all(Object.keys(keys).map(load));
    const result = await runCatalogScopeBackfill({
      batchSize: 50,
      dryRun: true,
    });
    expect(result.projectFilled).toBeGreaterThanOrEqual(4);
    expect(await Promise.all(Object.keys(keys).map(load))).toEqual(before);
  });

  it("fills only the missing projectId and preserves userId", async () => {
    const before = Object.fromEntries(
      await Promise.all(
        Object.keys(keys).map(async (key) => [key, await load(key)] as const),
      ),
    );
    await runCatalogScopeBackfill({ batchSize: 50, dryRun: false });

    for (const key of ["hiap-legacy", "hiap-inventory-only", "meed-legacy"]) {
      const row = await load(key);
      expect(row.projectId).toBe(tenant.projectId);
      expect(row.userId).toBe(creatorId);
      // nothing but projectId (and the update timestamps) changed
      const strip = (value: object) => {
        const {
          projectId: _projectId,
          lastUpdated: _lastUpdated,
          last_updated: _last_updated,
          ...rest
        } = value as Record<string, unknown>;
        return rest;
      };
      expect(strip(row)).toEqual(strip(before[key]));
    }
    // other modules: same rule
    expect(await load("ghgi-upload")).toMatchObject({
      userId: creatorId,
      projectId: tenant.projectId,
    });
    // already complete rows are untouched
    expect(await load("clean")).toEqual(before["clean"]);
    // no city to derive a project from: left alone, never guessed
    expect(await load("unresolved")).toEqual(before["unresolved"]);
  });

  it("is idempotent", async () => {
    const before = await Promise.all(Object.keys(keys).map(load));
    await runCatalogScopeBackfill({ batchSize: 50, dryRun: false });
    expect(await Promise.all(Object.keys(keys).map(load))).toEqual(before);
  });

  it("pages with a cursor and rejects a bad limit", async () => {
    const first = await backfillCatalogScopePage({ limit: 1, dryRun: true });
    expect(first.scanned).toBeLessThanOrEqual(1);
    if (first.hasMore) expect(first.nextCursor).not.toBeNull();
    await expect(
      backfillCatalogScopePage({ limit: 0, dryRun: true }),
    ).rejects.toThrow();
  });
});
