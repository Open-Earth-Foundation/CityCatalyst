import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Op } from "sequelize";

const userUpdate = jest.fn(async () => undefined);
const inviteDestroy = jest.fn(async () => undefined);
const tokenDestroy = jest.fn(async () => undefined);
const logCreate = jest.fn(async () => undefined);
const inviteUpdate = jest.fn(async () => [1]);
const organizationUpdate = jest.fn(async () => [1]);

const user = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "ada@example.com",
  anonymizedAt: null,
  update: userUpdate,
};
const invite = {
  id: "33333333-3333-3333-3333-333333333333",
  userId: user.userId,
  destroy: inviteDestroy,
};
const token = {
  id: "22222222-2222-2222-2222-222222222222",
  userId: user.userId,
  tokenPrefix: "cc_pat",
  destroy: tokenDestroy,
};

const userFindAll = jest.fn(async () => [user]);
const cityInviteFindAll = jest.fn(async () => [invite]);
const emptyFindAll = jest.fn(async () => []);
const tokenFindAll = jest.fn(async () => [token]);
const transaction = jest.fn(async (work: (tx: object) => Promise<void>) =>
  work({}),
);

jest.unstable_mockModule("@/models", () => ({
  db: {
    sequelize: { transaction },
    models: {
      User: { findAll: userFindAll },
      CityInvite: { findAll: cityInviteFindAll, update: inviteUpdate },
      OrganizationInvite: { findAll: emptyFindAll, update: inviteUpdate },
      ProjectInvite: { findAll: emptyFindAll, update: inviteUpdate },
      Organization: { update: organizationUpdate },
      PersonalAccessToken: { findAll: tokenFindAll },
      RetentionActionLog: { create: logCreate },
    },
  },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let enforceRetentionPolicies: typeof import("@/backend/gdpr/RetentionService").enforceRetentionPolicies;

beforeAll(async () => {
  ({ enforceRetentionPolicies } =
    await import("@/backend/gdpr/RetentionService"));
});

describe("retention job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GDPR_RETENTION_DRY_RUN;
    userFindAll.mockResolvedValue([user]);
    cityInviteFindAll.mockResolvedValue([invite]);
    emptyFindAll.mockResolvedValue([]);
    tokenFindAll.mockResolvedValue([token]);
    transaction.mockImplementation(async (work) => work({}));
  });

  it("only selects accounts that have not already been anonymized", async () => {
    await enforceRetentionPolicies(new Date("2026-09-28T03:15:00.000Z"));
    const where = userFindAll.mock.calls[0][0].where as {
      anonymizedAt: Record<symbol, unknown>;
    };
    expect(where.anonymizedAt[Op.is]).toBeNull();
  });

  it("anonymizes, deletes the stale invite, and revokes the token", async () => {
    const result = await enforceRetentionPolicies(
      new Date("2026-09-28T03:15:00.000Z"),
    );

    expect(userUpdate).toHaveBeenCalled();
    expect(inviteDestroy).toHaveBeenCalled();
    expect(tokenDestroy).toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledTimes(3);
    expect(result.dryRun).toBe(false);
    expect(result.inactiveAccountAnonymize).toEqual({
      matched: 1,
      applied: 1,
      failed: 0,
    });
    expect(result.staleInviteDelete.applied).toBe(1);
    expect(result.unusedTokenRevoke.applied).toBe(1);
  });

  it("logs a dry run and leaves the rows unchanged", async () => {
    process.env.GDPR_RETENTION_DRY_RUN = "true";
    const result = await enforceRetentionPolicies(
      new Date("2026-09-28T03:15:00.000Z"),
    );

    expect(result.dryRun).toBe(true);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(inviteDestroy).not.toHaveBeenCalled();
    expect(tokenDestroy).not.toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, action: "anonymize_user" }),
      expect.anything(),
    );
  });
});
