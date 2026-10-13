import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

interface StoredConsent {
  consentRecordId: string;
  consentType: "analytics" | "marketing";
  status: "granted" | "withdrawn";
  policyVersion: string;
  userId: string | null;
  subjectKey: string | null;
  created: Date;
}

const stored: StoredConsent[] = [];
const create = jest.fn(async (row: Record<string, unknown>) => {
  const plain = {
    ...(row as Omit<StoredConsent, "consentRecordId" | "created">),
    consentRecordId: `consent-${stored.length + 1}`,
    created: new Date("2026-09-28T12:00:00.000Z"),
  } as StoredConsent;
  stored.unshift(plain);
  return { get: () => plain };
});
const update = jest.fn(async () => [0]);
const findAll = jest.fn(async () =>
  stored.map((plain) => ({ get: () => plain })),
);

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      ConsentRecord: { create, update, findAll },
    },
  },
}));

let recordConsent: typeof import("@/backend/gdpr/ConsentService").recordConsent;
let listConsentForUser: typeof import("@/backend/gdpr/ConsentService").listConsentForUser;

beforeAll(async () => {
  ({ recordConsent, listConsentForUser } =
    await import("@/backend/gdpr/ConsentService"));
});

describe("consent ledger", () => {
  beforeEach(() => {
    stored.length = 0;
    create.mockClear();
    update.mockClear();
    findAll.mockClear();
  });

  it("appends a grant and a later withdrawal as the current status", async () => {
    await recordConsent({
      userId: "user-1",
      subjectKey: null,
      consentType: "analytics",
      granted: true,
      source: "cookie_banner",
      userAgent: null,
      ipAddress: null,
    });
    await recordConsent({
      userId: "user-1",
      subjectKey: null,
      consentType: "analytics",
      granted: false,
      source: "cookie_banner",
      userAgent: null,
      ipAddress: null,
    });

    const history = await listConsentForUser("user-1");
    expect(history.records).toHaveLength(2);
    expect(history.records[0].status).toBe("withdrawn");
    expect(history.current.analytics).toMatchObject({
      status: "withdrawn",
      policyVersion: "2026-09-28",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("links earlier anonymous rows when the same browser signs in", async () => {
    await recordConsent({
      userId: "user-1",
      subjectKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      consentType: "analytics",
      granted: true,
      source: "cookie_banner",
      userAgent: "Jest",
      ipAddress: "203.0.113.5",
    });

    expect(update).toHaveBeenCalledWith(
      { userId: "user-1" },
      {
        where: {
          subjectKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          userId: expect.anything(),
        },
      },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "granted",
        policyVersion: "2026-09-28",
        source: "cookie_banner",
      }),
    );
  });

  it("rejects a record with no user and no subject key", async () => {
    await expect(
      recordConsent({
        userId: null,
        subjectKey: null,
        consentType: "marketing",
        granted: true,
        source: "api",
        userAgent: null,
        ipAddress: null,
      }),
    ).rejects.toThrow(/subjectKey/);
  });
});
