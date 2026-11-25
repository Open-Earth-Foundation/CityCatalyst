/**
 * CC-1273: characterization tests for POST /api/v1/auth/register.
 *
 * These pin what the route does today, quirks included, so that moving it to
 * the identity service (CC-1279) can be checked against them. They are not a
 * statement of what the route should do. A test marked "quirk" documents
 * behavior that looks unintended; do not fix it here.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { db } from "@/models";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
} from "../helpers";

// The route sends mail through SMTP. Replace it before the route is loaded.
const sendEmailMock = jest.fn<(data: unknown) => Promise<void>>();
jest.unstable_mockModule("@/lib/email", () => ({ sendEmail: sendEmailMock }));
const { POST: register } = await import("@/app/api/v1/auth/register/route");

const PASSWORD = "Passw0rdTest";
const noParams = { params: Promise.resolve({}) };

/** A valid sign-up body with an email no other test uses. */
function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Register Tester",
    email: `register-${randomUUID()}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    acceptTerms: true,
    preferredLanguage: "en",
    ...overrides,
  };
}

describe("POST /api/v1/auth/register", () => {
  const createdEmails: string[] = [];
  let savedEmailEnabled: string | undefined;

  /** Registers and remembers the (lowercased) email for cleanup. */
  async function post(body: Record<string, unknown>) {
    if (typeof body.email === "string") {
      createdEmails.push(body.email.toLowerCase());
    }
    return register(mockRequest(body), noParams);
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.models.User.destroy({ where: { email: createdEmails } });
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(() => {
    savedEmailEnabled = process.env.EMAIL_ENABLED;
    delete process.env.EMAIL_ENABLED;
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (savedEmailEnabled === undefined) delete process.env.EMAIL_ENABLED;
    else process.env.EMAIL_ENABLED = savedEmailEnabled;
  });

  describe("creating the account", () => {
    it("returns a minimal user and stores the account", async () => {
      const body = signupBody({ name: "Jane Registrant" });
      const res = await post(body);
      await expectStatusCode(res, 200);

      const { user } = await res.json();
      expect(Object.keys(user).sort()).toEqual([
        "email",
        "name",
        "preferredLanguage",
        "role",
        "userId",
      ]);
      expect(user.userId).toMatch(/^[0-9a-f-]{36}$/);
      expect(user.name).toBe("Jane Registrant");
      expect(user.role).toBe("user");
      expect(user.preferredLanguage).toBe("en");

      const stored = await db.models.User.findOne({
        where: { userId: user.userId },
      });
      expect(stored).not.toBeNull();
      expect(stored!.email).toBe(body.email);
    });

    it("never returns the password or its hash", async () => {
      const res = await post(signupBody());
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain(PASSWORD);
      expect(text.toLowerCase()).not.toContain("hash");
      expect(text.toLowerCase()).not.toContain("password");
    });

    it("stores a bcrypt hash with cost 12, not the password", async () => {
      const body = signupBody();
      await post(body);
      const stored = await db.models.User.findOne({
        where: { email: body.email },
      });
      expect(stored!.passwordHash).toBeTruthy();
      expect(stored!.passwordHash).not.toBe(PASSWORD);
      expect(bcrypt.getRounds(stored!.passwordHash!)).toBe(12);
      expect(await bcrypt.compare(PASSWORD, stored!.passwordHash!)).toBe(true);
    });

    it("stores the email in lower case", async () => {
      const mixed = `Mixed.Case-${randomUUID()}@Example.com`;
      const res = await post(signupBody({ email: mixed }));
      await expectStatusCode(res, 200);
      expect((await res.json()).user.email).toBe(mixed.toLowerCase());
    });

    it("ignores a role sent in the body", async () => {
      const res = await post(signupBody({ role: "admin" }));
      await expectStatusCode(res, 200);
      expect((await res.json()).user.role).toBe("user");
    });

    it("stores the preferred language", async () => {
      const res = await post(signupBody({ preferredLanguage: "pt" }));
      await expectStatusCode(res, 200);
      expect((await res.json()).user.preferredLanguage).toBe("pt");
    });
  });

  describe("duplicate email", () => {
    it("answers 400 and keeps the first account", async () => {
      const first = signupBody();
      await expectStatusCode(await post(first), 200);

      const second = await post({ ...first, name: "Somebody Else" });
      await expectStatusCode(second, 400);
      expect((await second.json()).error.message).toBe(
        "Entity exists already.",
      );

      const accounts = await db.models.User.findAll({
        where: { email: first.email },
      });
      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe("Register Tester");
    });

    it("treats the same address in another case as a duplicate", async () => {
      const first = signupBody();
      await expectStatusCode(await post(first), 200);
      const shouting = await post({
        ...first,
        email: first.email.toUpperCase(),
      });
      await expectStatusCode(shouting, 400);
    });
  });

  describe("invalid input", () => {
    // Zod errors are answered with 400, although the OpenAPI text says 422.
    it.each([
      ["a name shorter than 4 characters", { name: "Abc" }],
      ["an invalid email", { email: "not-an-email" }],
      [
        "a password without an upper case letter",
        { password: "passw0rdtest", confirmPassword: "passw0rdtest" },
      ],
      [
        "a password without a digit",
        { password: "PasswordTest", confirmPassword: "PasswordTest" },
      ],
      [
        "a password shorter than 4 characters",
        { password: "Pa1", confirmPassword: "Pa1" },
      ],
      [
        "a confirmation that does not match",
        { confirmPassword: "Different1Pass" },
      ],
      ["terms not accepted", { acceptTerms: false }],
      ["an unknown language", { preferredLanguage: "xx" }],
      ["a missing language", { preferredLanguage: undefined }],
      ["a malformed inventory id", { inventory: "not-a-uuid" }],
    ])(
      "answers 400 for %s and creates no account",
      async (_name, overrides) => {
        const body = signupBody(overrides as Record<string, unknown>);
        const res = await post(body);
        await expectStatusCode(res, 400);
        expect((await res.json()).error.issues).toBeDefined();
        expect(
          await db.models.User.count({
            where: { email: body.email.toLowerCase() },
          }),
        ).toBe(0);
      },
    );
  });

  describe("joining a city through an inventory", () => {
    const cityId = randomUUID();
    const inventoryId = randomUUID();

    beforeAll(async () => {
      await db.models.City.create({
        cityId,
        name: "XX_CC1273_register_city",
        locode: `XX_CC1273_${randomUUID().slice(0, 8)}`,
      });
      await db.models.Inventory.create({
        inventoryId,
        cityId,
        inventoryName: "XX_CC1273_register_inventory",
        year: 2023,
        totalEmissions: 0,
        inventoryType: InventoryTypeEnum.GPC_BASIC,
        globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      });
    });

    afterAll(async () => {
      await db.models.CityUser.destroy({ where: { cityId } });
      await db.models.Inventory.destroy({ where: { inventoryId } });
      await db.models.City.destroy({ where: { cityId } });
    });

    it("gives the new user access to the inventory's city", async () => {
      const body = signupBody({ inventory: inventoryId });
      const res = await post(body);
      await expectStatusCode(res, 200);

      const { userId } = (await res.json()).user;
      const membership = await db.models.CityUser.findOne({
        where: { userId, cityId },
      });
      expect(membership).not.toBeNull();
    });
  });

  describe("welcome email", () => {
    it("is not sent unless EMAIL_ENABLED is the string true", async () => {
      await expectStatusCode(await post(signupBody()), 200);
      process.env.EMAIL_ENABLED = "1";
      await expectStatusCode(await post(signupBody()), 200);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("is sent to the address as typed when EMAIL_ENABLED is true", async () => {
      process.env.EMAIL_ENABLED = "true";
      const typed = `Typed.Case-${randomUUID()}@Example.com`;
      await expectStatusCode(await post(signupBody({ email: typed })), 200);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const mail = sendEmailMock.mock.calls[0][0] as {
        to: string;
        subject: string;
        html: string;
      };
      // The account is stored in lower case, the email goes to the typed form.
      expect(mail.to).toBe(typed);
      expect(mail.subject).toBeTruthy();
      expect(mail.html).toContain("Register Tester");
    });

    it("quirk: a failed send answers 400 but the account was already created", async () => {
      process.env.EMAIL_ENABLED = "true";
      sendEmailMock.mockRejectedValue(new Error("SMTP down"));
      const body = signupBody();

      const res = await post(body);
      await expectStatusCode(res, 400);
      expect((await res.json()).error.message).toBe("Email could not be sent");

      // The caller is told it failed, yet the user exists and can log in.
      expect(
        await db.models.User.count({
          where: { email: body.email.toLowerCase() },
        }),
      ).toBe(1);
    });
  });
});
