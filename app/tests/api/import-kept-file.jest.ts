/**
 * CC-1274: an import whose uploader was deleted is kept with no user. A
 * teammate must still be able to open it. Imports of users who still exist stay
 * private to their uploader.
 *
 * The lookup runs against the real database, because the bug was in its
 * `where` clause.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import env from "@next/env";
import { db } from "@/models";
import { uploadedByOrOrphaned } from "@/models/ImportedInventoryFile";
import {
  GlobalWarmingPotentialTypeEnum,
  ImportStatusEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const PREFIX = "XX_CC1274_IMPORT_";
const uploaderId = randomUUID(); // deleted during setup
const otherUploaderId = randomUUID(); // still exists
const teammateId = randomUUID(); // signed in, did not upload anything
const cityId = randomUUID();
const inventoryId = randomUUID();
const keptFileId = randomUUID();
const privateFileId = randomUUID();

// Signed in as the teammate.
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler:
    (
      handler: (
        req: NextRequest,
        context: {
          params: Record<string, string>;
          session: { user: { id: string } };
        },
      ) => Promise<Response>,
    ) =>
    async (
      req: NextRequest,
      props: { params: Promise<Record<string, string>> },
    ) =>
      handler(req, {
        params: await props.params,
        session: { user: { id: teammateId } },
      }),
}));
// The teammate has access to the inventory.
jest.unstable_mockModule("@/backend/UserService", () => ({
  default: {
    findUserInventory: jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined),
  },
}));
jest.unstable_mockModule("@/backend/GHGINativeInputCatalogService", () => ({
  syncGHGIImportedInventorySource: jest
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
  syncGHGIInventory: jest
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
}));
jest.unstable_mockModule("@/backend/PdfOcrService", () => ({
  getInventoryPdfOcrStatus: jest
    .fn<() => Promise<null>>()
    .mockResolvedValue(null),
}));

const { GET } =
  await import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/route");

function open(importedFileId: string) {
  return GET(new NextRequest("http://localhost/api/v1/import"), {
    params: Promise.resolve({
      city: cityId,
      inventory: inventoryId,
      importedFileId,
    }),
  });
}

describe("Opening a kept import", () => {
  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    await db.models.User.bulkCreate([
      { userId: uploaderId, name: `${PREFIX}uploader` },
      { userId: otherUploaderId, name: `${PREFIX}other` },
      { userId: teammateId, name: `${PREFIX}teammate` },
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
    for (const [id, userId] of [
      [keptFileId, uploaderId],
      [privateFileId, otherUploaderId],
    ] as const) {
      await db.models.ImportedInventoryFile.create({
        id,
        userId,
        cityId,
        inventoryId,
        fileName: `${PREFIX}${id}.csv`,
        fileType: "csv",
        fileSize: 1,
        originalFileName: `${PREFIX}${id}.csv`,
        importStatus: ImportStatusEnum.UPLOADED,
      });
    }

    // The uploader's account is deleted. The import stays, with no user.
    await db.models.User.destroy({ where: { userId: uploaderId } });
  });

  afterAll(async () => {
    await db.models.ImportedInventoryFile.destroy({ where: { cityId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await db.models.City.destroy({ where: { cityId } });
    await db.models.User.destroy({
      where: { userId: [otherUploaderId, teammateId] },
    });
    await db.sequelize?.close();
  });

  it("keeps the import with no user", async () => {
    const file = await db.models.ImportedInventoryFile.findByPk(keptFileId);
    expect(file).not.toBeNull();
    expect(file!.userId).toBeNull();
  });

  it("lets a teammate open an import whose uploader was deleted", async () => {
    const res = await open(keptFileId);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(keptFileId);
  });

  it("still hides an import from a teammate while its uploader exists", async () => {
    // The test's apiHandler does not turn errors into responses, so the 404
    // arrives as a thrown NotFoundError.
    await expect(open(privateFileId)).rejects.toMatchObject({ status: 404 });
  });

  // Every import route (open, extract, interpret, row-preview, approve) uses
  // this filter in its lookup, so this covers the shared condition.
  describe("uploadedByOrOrphaned", () => {
    const find = (userId: string, id: string) =>
      db.models.ImportedInventoryFile.findOne({
        where: {
          id,
          inventoryId,
          cityId,
          userId: uploadedByOrOrphaned(userId),
        },
      });

    it("finds a kept import for anyone", async () => {
      expect(await find(teammateId, keptFileId)).not.toBeNull();
    });

    it("finds an import for its own uploader", async () => {
      expect(await find(otherUploaderId, privateFileId)).not.toBeNull();
    });

    it("does not find an import of another existing user", async () => {
      expect(await find(teammateId, privateFileId)).toBeNull();
    });
  });
});
