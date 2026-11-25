import { db } from "@/models";
import IdentityClaimsService from "@/backend/oauth/IdentityClaimsService";
import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";
import { setupTests, teardownTests } from "../helpers";

// The three routes that lead to an organization are stubbed, so the test
// checks the merging logic without building a tenant tree in the database.
describe("IdentityClaimsService.orgIdsForUser", () => {
  const userId = randomUUID();
  const orgA = "aaaaaaaa-0000-4000-8000-000000000001";
  const orgB = "bbbbbbbb-0000-4000-8000-000000000002";
  const orgC = "cccccccc-0000-4000-8000-000000000003";

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    teardownTests();
    await db.sequelize?.close();
  });

  function stub(
    orgAdmins: unknown[],
    projectAdmins: unknown[],
    cityUsers: unknown[],
  ) {
    jest
      .spyOn(db.models.OrganizationAdmin, "findAll")
      .mockResolvedValue(orgAdmins as never);
    jest
      .spyOn(db.models.ProjectAdmin, "findAll")
      .mockResolvedValue(projectAdmins as never);
    jest
      .spyOn(db.models.CityUser, "findAll")
      .mockResolvedValue(cityUsers as never);
  }

  it("combines the three routes, without duplicates, sorted", async () => {
    stub(
      [{ organizationId: orgC }, { organizationId: orgA }],
      [
        { project: { organizationId: orgB } },
        { project: { organizationId: orgA } },
      ],
      [{ city: { project: { organizationId: orgB } } }],
    );
    expect(await IdentityClaimsService.orgIdsForUser(userId)).toEqual([
      orgA,
      orgB,
      orgC,
    ]);
  });

  it("skips cities and projects that have no organization", async () => {
    stub(
      [],
      [{ project: null }, { project: { organizationId: null } }],
      [{ city: null }, { city: { project: null } }],
    );
    expect(await IdentityClaimsService.orgIdsForUser(userId)).toEqual([]);
  });

  it("returns an empty list for a user with no memberships", async () => {
    stub([], [], []);
    expect(await IdentityClaimsService.orgIdsForUser(userId)).toEqual([]);
  });
});

describe("IdentityClaimsService.forUser", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    teardownTests();
    await db.sequelize?.close();
  });

  it("throws 404 for an unknown user", async () => {
    await expect(
      IdentityClaimsService.forUser(randomUUID()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("leaves out email and name a user does not have", async () => {
    const userId = randomUUID();
    await db.models.User.create({ userId });
    try {
      expect(await IdentityClaimsService.forUser(userId)).toEqual({
        sub: userId,
        org_ids: [],
      });
    } finally {
      await db.models.User.destroy({ where: { userId } });
    }
  });
});
