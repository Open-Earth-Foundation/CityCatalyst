import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import {
  authorizeCatalogScope,
  discoverNativeInputs,
  readNativeInputCapability,
} from "@/backend/NativeInputCatalogCapabilityService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { Roles } from "@/util/types";
import type { AppSession } from "@/lib/auth";
import { baseInventory } from "./api/results.data";
import { setupTests } from "./helpers";
import {
  cleanupTestData,
  createTestData,
  type TestData,
} from "./helpers/testDataCreationHelper";

// CC-1060 PR 2: catalog rows are authorized at city and project. Real database,
// real PermissionService; only the session objects are synthetic.

const session = (userId: string, role: Roles = Roles.User): AppSession => ({
  user: { id: userId, role },
  expires: "1h",
});

type RowKind =
  | "hiap ranking"
  | "hiap selection"
  | "hiap plan"
  | "meed ranking"
  | "meed output plan";

const ROW_SHAPES: Record<
  RowKind,
  { kind: string; owningModule: string; sourceType: string }
> = {
  "hiap ranking": {
    kind: "hiap_ranking",
    owningModule: "hiap",
    sourceType: "hiap_ranking",
  },
  "hiap selection": {
    kind: "hiap_selection",
    owningModule: "hiap",
    sourceType: "hiap_ranked_selection",
  },
  "hiap plan": {
    kind: "hiap_action_plan",
    owningModule: "hiap",
    sourceType: "action_plan",
  },
  "meed ranking": {
    kind: "hiap_meed_ranking",
    owningModule: "hiap_meed",
    sourceType: "hiap_meed_ranking",
  },
  "meed output plan": {
    kind: "hiap_meed_output_plan",
    owningModule: "hiap_meed",
    sourceType: "hiap_meed_output_plan",
  },
};
const ROW_KINDS = Object.keys(ROW_SHAPES) as RowKind[];

describe("NativeInputCatalog access at city and project (CC-1060 PR 2)", () => {
  let p1: TestData; // organization, project P1, city A
  let p2ProjectId: string; // second project in the same organization
  let cityA2Id: string; // same city name as A, inside P2
  let otherOrg: TestData;
  const ids = {
    inv2022: randomUUID(),
    inv2023: randomUUID(),
    invA2: randomUUID(),
    orgAdmin: randomUUID(),
    projectAdminP1: randomUUID(),
    projectAdminP2: randomUUID(),
    collaboratorA: randomUUID(),
    collaboratorA2: randomUUID(),
    creator: randomUUID(),
    formerCreator: randomUUID(),
    outsider: randomUUID(),
    systemAdmin: randomUUID(),
  };
  const userIds = Object.entries(ids)
    .filter(([key]) => !key.startsWith("inv"))
    .map(([, value]) => value);
  const catalogIds: string[] = [];
  const rows: Record<string, string> = {};

  async function createInventory(
    inventoryId: string,
    cityId: string,
    year: number,
  ) {
    await db.models.Inventory.create({
      inventoryId,
      ...baseInventory,
      inventoryName: `cc1060-pr2-${year}-${inventoryId.slice(0, 8)}`,
      cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year,
      isPublic: false,
    });
  }

  async function createRow(
    key: string,
    kind: RowKind,
    scope: {
      inventoryId: string | null;
      cityId: string | null;
      projectId: string | null;
      organizationId: string | null;
      userId?: string | null;
    },
  ) {
    const created = await db.models.NativeInputCatalog.create({
      ...ROW_SHAPES[kind],
      sourceId: `cc1060-pr2:${key}:${randomUUID()}`,
      availability: "active",
      labels: { display_name: `Row ${key}` },
      userId: null,
      ...scope,
    });
    catalogIds.push(created.id);
    rows[key] = created.id;
    return created;
  }

  async function canRead(
    userId: string,
    key: string,
    request: Record<string, string> = {},
    role: Roles = Roles.User,
  ) {
    const entry = await db.models.NativeInputCatalog.findByPk(rows[key]);
    return authorizeCatalogScope(
      session(userId, role),
      request,
      entry as never,
    );
  }

  async function setPublic(isPublic: boolean) {
    await db.models.Inventory.update(
      { isPublic },
      { where: { inventoryId: ids.inv2022 } },
    );
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    p1 = await createTestData({
      organizationName: "CC1060 PR2 Org",
      projectName: "CC1060 PR2 P1",
      cityName: "Shared City",
    });
    otherOrg = await createTestData({
      organizationName: "CC1060 PR2 Other Org",
      projectName: "CC1060 PR2 Other Project",
      cityName: "Elsewhere",
    });

    p2ProjectId = randomUUID();
    cityA2Id = randomUUID();
    await db.models.Project.create({
      projectId: p2ProjectId,
      name: "CC1060 PR2 P2",
      description: "Second project of the same organization",
      organizationId: p1.organizationId,
      cityCountLimit: 10,
    });
    await db.models.City.create({
      cityId: cityA2Id,
      name: "Shared City",
      countryLocode: "US",
      projectId: p2ProjectId,
    });

    await db.models.User.bulkCreate(
      Object.entries(ids)
        .filter(([key]) => !key.startsWith("inv"))
        .map(([key, userId]) => ({ userId, name: `cc1060-pr2-${key}` })),
    );
    await db.models.OrganizationAdmin.create({
      organizationAdminId: randomUUID(),
      userId: ids.orgAdmin,
      organizationId: p1.organizationId,
    });
    await db.models.ProjectAdmin.create({
      projectAdminId: randomUUID(),
      userId: ids.projectAdminP1,
      projectId: p1.projectId,
    });
    await db.models.ProjectAdmin.create({
      projectAdminId: randomUUID(),
      userId: ids.projectAdminP2,
      projectId: p2ProjectId,
    });
    const cityA = (await db.models.City.findByPk(p1.cityId))!;
    await cityA.addUser(ids.collaboratorA);
    await cityA.addUser(ids.creator);
    const cityA2 = (await db.models.City.findByPk(cityA2Id))!;
    await cityA2.addUser(ids.collaboratorA2);
    // formerCreator made rows once but has no role any more.

    await createInventory(ids.inv2022, p1.cityId, 2022);
    await createInventory(ids.inv2023, p1.cityId, 2023);
    await createInventory(ids.invA2, cityA2Id, 2022);

    const scopeA = (inventoryId: string | null) => ({
      inventoryId,
      cityId: p1.cityId,
      projectId: p1.projectId,
      organizationId: p1.organizationId,
    });
    for (const kind of ROW_KINDS) {
      // new shape: no creator on the row
      await createRow(`${kind}/2022`, kind, scopeA(ids.inv2022));
      await createRow(`${kind}/2023`, kind, scopeA(ids.inv2023));
      // legacy shape: the creator userId is still on the row
      await createRow(`${kind}/legacy`, kind, {
        ...scopeA(ids.inv2022),
        userId: ids.formerCreator,
      });
      await createRow(`${kind}/legacy-creator`, kind, {
        ...scopeA(ids.inv2022),
        userId: ids.creator,
      });
      await createRow(`${kind}/A2`, kind, {
        inventoryId: ids.invA2,
        cityId: cityA2Id,
        projectId: p2ProjectId,
        organizationId: p1.organizationId,
      });
    }
  });

  afterAll(async () => {
    await db.models.NativeInputCatalog.destroy({
      where: { id: { [Op.in]: catalogIds } },
    });
    await db.models.Inventory.destroy({
      where: {
        inventoryId: { [Op.in]: [ids.inv2022, ids.inv2023, ids.invA2] },
      },
    });
    await db.models.CityUser.destroy({
      where: { cityId: { [Op.in]: [p1.cityId, cityA2Id] } },
    });
    await db.models.City.destroy({ where: { cityId: cityA2Id } });
    await db.models.ProjectAdmin.destroy({
      where: {
        userId: { [Op.in]: [ids.projectAdminP1, ids.projectAdminP2] },
      },
    });
    await db.models.OrganizationAdmin.destroy({
      where: { userId: ids.orgAdmin },
    });
    await db.models.Project.destroy({ where: { projectId: p2ProjectId } });
    await cleanupTestData(p1);
    await cleanupTestData(otherOrg);
    await db.models.User.destroy({ where: { userId: { [Op.in]: userIds } } });
  });

  describe("role matrix for city A in project P1", () => {
    // [who, user id, reads city A in P1, reads the same-named city in P2]
    const matrix: Array<[string, () => string, boolean, boolean]> = [
      ["organization admin", () => ids.orgAdmin, true, true],
      ["project admin of P1", () => ids.projectAdminP1, true, false],
      ["project admin of P2 only", () => ids.projectAdminP2, false, true],
      ["collaborator of city A", () => ids.collaboratorA, true, false],
      [
        "collaborator of the P2 city only",
        () => ids.collaboratorA2,
        false,
        true,
      ],
      ["original creator who still has access", () => ids.creator, true, false],
      [
        "original creator without access",
        () => ids.formerCreator,
        false,
        false,
      ],
      ["outsider in another organization", () => ids.outsider, false, false],
    ];

    describe.each(ROW_KINDS)("%s", (kind) => {
      it.each(matrix)("%s", async (_who, user, readsP1, readsP2) => {
        expect(await canRead(user(), `${kind}/2022`)).toBe(readsP1);
        expect(await canRead(user(), `${kind}/A2`)).toBe(readsP2);
      });

      it("lets a colleague read a row another user created", async () => {
        expect(await canRead(ids.collaboratorA, `${kind}/legacy`)).toBe(true);
        expect(await canRead(ids.projectAdminP1, `${kind}/legacy`)).toBe(true);
        // The creator has no special right once access is gone.
        expect(await canRead(ids.formerCreator, `${kind}/legacy`)).toBe(false);
        // A creator that keeps access still reads it, and so does a colleague.
        expect(await canRead(ids.creator, `${kind}/legacy-creator`)).toBe(true);
        expect(await canRead(ids.collaboratorA, `${kind}/legacy-creator`)).toBe(
          true,
        );
      });

      it("reads every year of the same city and project", async () => {
        expect(await canRead(ids.collaboratorA, `${kind}/2022`)).toBe(true);
        expect(await canRead(ids.collaboratorA, `${kind}/2023`)).toBe(true);
        expect(
          await canRead(ids.collaboratorA, `${kind}/2023`, {
            cityId: p1.cityId,
          }),
        ).toBe(true);
      });

      it("denies an outsider even when the inventory is public", async () => {
        await setPublic(true);
        try {
          // the public path of canAccessInventory would let the outsider in
          await expect(
            PermissionService.canAccessInventory(
              session(ids.outsider),
              ids.inv2022,
              { includeResource: false },
            ),
          ).resolves.toMatchObject({ hasAccess: true });
          expect(await canRead(ids.outsider, `${kind}/2022`)).toBe(false);
          expect(
            await canRead(ids.outsider, `${kind}/2022`, {
              inventoryId: ids.inv2022,
            }),
          ).toBe(false);
        } finally {
          await setPublic(false);
        }
      });
    });

    it("lets a system admin read", async () => {
      expect(
        await canRead(ids.systemAdmin, "meed ranking/2022", {}, Roles.Admin),
      ).toBe(true);
    });
  });

  describe("fail-closed consistency checks", () => {
    it("denies a row whose projectId disagrees with the city project", async () => {
      await createRow("stale-project", "meed ranking", {
        inventoryId: ids.inv2022,
        cityId: p1.cityId,
        projectId: p2ProjectId,
        organizationId: p1.organizationId,
      });
      expect(await canRead(ids.orgAdmin, "stale-project")).toBe(false);
      expect(await canRead(ids.collaboratorA, "stale-project")).toBe(false);
    });

    it("denies a row whose inventory belongs to another city", async () => {
      await createRow("stale-inventory", "hiap ranking", {
        inventoryId: ids.invA2,
        cityId: p1.cityId,
        projectId: p1.projectId,
        organizationId: p1.organizationId,
      });
      expect(await canRead(ids.orgAdmin, "stale-inventory")).toBe(false);
    });

    it("denies a request that names another project, city or organization", async () => {
      expect(
        await canRead(ids.collaboratorA, "hiap ranking/2022", {
          projectId: p2ProjectId,
        }),
      ).toBe(false);
      expect(
        await canRead(ids.collaboratorA, "hiap ranking/2022", {
          cityId: cityA2Id,
        }),
      ).toBe(false);
      expect(
        await canRead(ids.collaboratorA, "hiap ranking/2022", {
          organizationId: otherOrg.organizationId,
        }),
      ).toBe(false);
    });

    it("lets a city-level row serve a year of the same city only", async () => {
      await createRow("city-level", "hiap plan", {
        inventoryId: null,
        cityId: p1.cityId,
        projectId: p1.projectId,
        organizationId: p1.organizationId,
      });
      expect(
        await canRead(ids.collaboratorA, "city-level", {
          inventoryId: ids.inv2023,
        }),
      ).toBe(true);
      expect(
        await canRead(ids.collaboratorA, "city-level", {
          inventoryId: ids.invA2,
        }),
      ).toBe(false);
    });

    it("authorizes legacy rows that miss projectId from the city", async () => {
      await createRow("no-project", "hiap ranking", {
        inventoryId: ids.inv2022,
        cityId: p1.cityId,
        projectId: null,
        organizationId: null,
        userId: ids.formerCreator,
      });
      expect(await canRead(ids.collaboratorA, "no-project")).toBe(true);
      expect(await canRead(ids.projectAdminP2, "no-project")).toBe(false);
      expect(await canRead(ids.outsider, "no-project")).toBe(false);
    });
  });

  describe("discovery and reads through the service", () => {
    const discoveredIds = async (
      userId: string,
      request: Record<string, string> = {},
    ) => {
      const page = await discoverNativeInputs(
        { userId, cityId: p1.cityId, ...request },
        session(userId),
      );
      return page.entries
        .map((entry) => entry.catalog_id)
        .filter((id) => catalogIds.includes(id));
    };

    it("shows a colleague both years of the same city and project", async () => {
      const found = await discoveredIds(ids.collaboratorA);
      for (const kind of ROW_KINDS) {
        expect(found).toContain(rows[`${kind}/2022`]);
        expect(found).toContain(rows[`${kind}/2023`]);
        expect(found).toContain(rows[`${kind}/legacy`]);
      }
      expect(found).not.toContain(rows["hiap ranking/A2"]);
    });

    it("shows a project admin the rows of their own project only", async () => {
      expect(await discoveredIds(ids.projectAdminP1)).toContain(
        rows["meed ranking/2022"],
      );
      expect(await discoveredIds(ids.projectAdminP2)).toEqual([]);
    });

    it("shows an outsider nothing, even for a public inventory", async () => {
      await setPublic(true);
      try {
        expect(await discoveredIds(ids.outsider)).toEqual([]);
        expect(
          await discoveredIds(ids.outsider, { inventoryId: ids.inv2022 }),
        ).toEqual([]);
        expect(
          await discoveredIds(ids.outsider, { owningModule: "hiap_meed" }),
        ).toEqual([]);
      } finally {
        await setPublic(false);
      }
    });

    it("answers an unauthorized row exactly like a missing one", async () => {
      const attempt = (catalogId: string) =>
        readNativeInputCapability(
          {
            userId: ids.outsider,
            catalogId,
            capabilityId: "hiap_meed.ranking.context",
            input: {},
          },
          session(ids.outsider),
        ).then(
          () => null,
          (error: unknown) => {
            const e = error as {
              statusCode: number;
              code: string;
              message: string;
            };
            return {
              statusCode: e.statusCode,
              code: e.code,
              message: e.message,
            };
          },
        );

      const unauthorized = await attempt(rows["meed ranking/2022"]);
      const missing = await attempt(randomUUID());
      expect(unauthorized).not.toBeNull();
      expect(unauthorized).toEqual(missing);
      expect(unauthorized).toMatchObject({
        statusCode: 404,
        code: "capability_unavailable",
      });
    });
  });
});
