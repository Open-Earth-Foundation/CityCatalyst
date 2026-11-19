/**
 * CC-1274: deleting a user keeps their inventory edit history and their
 * imported and uploaded files, with the user reference set to null.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import VersionHistoryService from "@/backend/VersionHistoryService";
import { groupInventoryHistory } from "@/components/GHGI/inventory-versions/history-helpers";
import { db } from "@/models";
import type { VersionHistoryEntry } from "@/util/types";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const PREFIX = "XX_CC1274_";

describe("Deleting a user keeps their data", () => {
  const deletedUserId = randomUUID();
  const keptUserId = randomUUID();
  const cityId = randomUUID();
  const inventoryId = randomUUID();
  const versionIds = { deleted: randomUUID(), kept: randomUUID() };
  const importedFileIds = { deleted: randomUUID(), kept: randomUUID() };
  const userFileIds = { deleted: randomUUID(), kept: randomUUID() };

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    await db.models.User.bulkCreate([
      { userId: deletedUserId, name: `${PREFIX}deleted` },
      { userId: keptUserId, name: `${PREFIX}kept` },
    ]);
    await db.models.City.create({
      cityId,
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    await db.models.Inventory.create({
      inventoryId,
      cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2023,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    for (const [key, authorId] of [
      ["deleted", deletedUserId],
      ["kept", keptUserId],
    ] as const) {
      await db.models.Version.create({
        versionId: versionIds[key],
        inventoryId,
        authorId,
        entryId: randomUUID(),
        table: "InventoryValue",
        data: { co2eq: 1 },
        isDeleted: false,
      });
      await db.models.ImportedInventoryFile.create({
        id: importedFileIds[key],
        userId: authorId,
        cityId,
        inventoryId,
        fileName: `${PREFIX}${key}.csv`,
        fileType: "csv",
        fileSize: 1,
        originalFileName: `${PREFIX}${key}.csv`,
      });
      await db.models.UserFile.create({
        id: userFileIds[key],
        userId: authorId,
        cityId,
        fileName: `${PREFIX}${key}.csv`,
      });
    }

    // The action under test.
    await db.models.User.destroy({ where: { userId: deletedUserId } });
  });

  afterAll(async () => {
    await db.models.Version.destroy({ where: { inventoryId } });
    await db.models.ImportedInventoryFile.destroy({ where: { cityId } });
    await db.models.UserFile.destroy({ where: { cityId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await db.models.City.destroy({ where: { cityId } });
    await db.models.User.destroy({ where: { userId: keptUserId } });
    await db.sequelize?.close();
  });

  it("deletes the user", async () => {
    expect(await db.models.User.findByPk(deletedUserId)).toBeNull();
    expect(await db.models.User.findByPk(keptUserId)).not.toBeNull();
  });

  it("keeps their Version rows, with no author", async () => {
    const version = await db.models.Version.findByPk(versionIds.deleted);
    expect(version).not.toBeNull();
    expect(version!.authorId).toBeNull();
  });

  it("keeps their ImportedInventoryFile rows, with no user", async () => {
    const file = await db.models.ImportedInventoryFile.findByPk(
      importedFileIds.deleted,
    );
    expect(file).not.toBeNull();
    expect(file!.userId).toBeNull();
    expect(file!.fileName).toBe(`${PREFIX}deleted.csv`);
  });

  it("keeps their UserFile rows, with no user", async () => {
    const file = await db.models.UserFile.findByPk(userFileIds.deleted);
    expect(file).not.toBeNull();
    expect(file!.userId).toBeNull();
  });

  it("leaves the data of other users untouched", async () => {
    const version = await db.models.Version.findByPk(versionIds.kept);
    const imported = await db.models.ImportedInventoryFile.findByPk(
      importedFileIds.kept,
    );
    const userFile = await db.models.UserFile.findByPk(userFileIds.kept);
    expect(version!.authorId).toBe(keptUserId);
    expect(imported!.userId).toBe(keptUserId);
    expect(userFile!.userId).toBe(keptUserId);
  });

  it("returns version history with a null author for the deleted user", async () => {
    const history = await VersionHistoryService.getVersionHistory(inventoryId);
    expect(history).toHaveLength(2);

    const byId = new Map(history.map((entry) => [entry.versionId, entry]));
    expect(byId.get(versionIds.deleted)!.author).toBeNull();
    expect(byId.get(versionIds.kept)!.author?.userId).toBe(keptUserId);
  });

  it("groups history entries whose author is null", () => {
    const entry = (versionId: string, author: { userId: string } | null) =>
      ({
        version: {
          versionId,
          author: author && { name: "A", ...author },
          created: new Date("2026-01-01T10:00:00Z"),
          previousVersion: null,
        },
      }) as unknown as VersionHistoryEntry;

    // Two edits by deleted accounts in a row form one group instead of crashing.
    const groups = groupInventoryHistory([entry("2", null), entry("1", null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);

    // A deleted author followed by a known author starts a new group.
    const mixed = groupInventoryHistory([
      entry("2", { userId: keptUserId }),
      entry("1", null),
    ]);
    expect(mixed).toHaveLength(2);
  });
});
