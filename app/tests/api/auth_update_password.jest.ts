/**
 * CC-1273: characterization tests for POST /api/v1/auth/update-password.
 *
 * These pin what the route does today, quirks included, so that moving it to
 * the identity service (CC-1279) can be checked against them. A test marked
 * "quirk" documents behavior that looks unintended; do not fix it here.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { db } from "@/models";
import { Roles } from "@/util/types";
import { POST as updatePassword } from "@/app/api/v1/auth/update-password/route";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
} from "../helpers";

const OLD_PASSWORD = "OldPassw0rd";
const NEW_PASSWORD = "NewPassw0rd";
const noParams = { params: Promise.resolve({}) };

describe("POST /api/v1/auth/update-password", () => {
  const userId = randomUUID();
  const email = `update-password-${randomUUID()}@example.com`;

  function sessionFor(id: string, role = Roles.User): AppSession {
    return {
      user: { id, name: "Update Tester", email, role },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  const signInAs = (session: AppSession | null) =>
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(session);

  const call = (body: unknown) => updatePassword(mockRequest(body), noParams);

  async function storedHash() {
    const user = await db.models.User.findByPk(userId);
    return user!.passwordHash;
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.create({
      userId,
      name: "Update Tester",
      email,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
    });
  });

  afterAll(async () => {
    await db.models.User.destroy({ where: { userId } });
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(async () => {
    signInAs(sessionFor(userId));
    await db.models.User.update(
      { passwordHash: await bcrypt.hash(OLD_PASSWORD, 4) },
      { where: { userId } },
    );
  });

  describe("changing the password", () => {
    it("answers { success: true } and stores the new password", async () => {
      const res = await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ success: true });

      const hash = (await storedHash())!;
      expect(await bcrypt.compare(NEW_PASSWORD, hash)).toBe(true);
      expect(await bcrypt.compare(OLD_PASSWORD, hash)).toBe(false);
    });

    it("quirk: hashes with bcrypt cost 10, while register and reset use 12", async () => {
      await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      expect(bcrypt.getRounds((await storedHash())!)).toBe(10);
    });

    it("quirk: the new password is the field named confirmPassword, and there is no separate new-password field to compare it with", async () => {
      // `newPassword` is not part of the schema and is dropped.
      const res = await call({
        currentPassword: OLD_PASSWORD,
        newPassword: "Ignored1Password",
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 200);
      const hash = (await storedHash())!;
      expect(await bcrypt.compare(NEW_PASSWORD, hash)).toBe(true);
      expect(await bcrypt.compare("Ignored1Password", hash)).toBe(false);
    });

    it("lets the user set the same password again", async () => {
      const res = await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: OLD_PASSWORD,
      });
      await expectStatusCode(res, 200);
    });
  });

  describe("checking the current password", () => {
    it("answers 400 for a wrong current password and keeps the stored one", async () => {
      const before = await storedHash();
      const res = await call({
        currentPassword: "WrongPassw0rd",
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 400);
      expect((await res.json()).error.message).toBe(
        "Current password is incorrect!",
      );
      expect(await storedHash()).toBe(before);
    });

    it("quirk: an account with no password hash gets a 500, not a 400", async () => {
      await db.models.User.update(
        { passwordHash: null },
        { where: { userId } },
      );
      const res = await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 500);
    });
  });

  describe("who may call it", () => {
    it("answers 401 when nobody is signed in", async () => {
      signInAs(null);
      const res = await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 401);
      expect((await res.json()).error.message).toBe(
        "Not signed in as the requested user",
      );
    });

    it("answers 404 when the signed-in user no longer exists", async () => {
      signInAs(sessionFor(randomUUID()));
      const res = await call({
        currentPassword: OLD_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
      await expectStatusCode(res, 404);
      expect((await res.json()).error.message).toBe("User not found");
    });

    it("only ever changes the signed-in user's own password, even for an admin", async () => {
      const other = randomUUID();
      const otherHash = await bcrypt.hash("OtherPassw0rd", 4);
      await db.models.User.create({
        userId: other,
        name: "Other User",
        email: `other-${randomUUID()}@example.com`,
        passwordHash: otherHash,
      });
      try {
        signInAs(sessionFor(userId, Roles.Admin));
        await call({
          currentPassword: OLD_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        });
        const untouched = await db.models.User.findByPk(other);
        expect(untouched!.passwordHash).toBe(otherHash);
      } finally {
        await db.models.User.destroy({ where: { userId: other } });
      }
    });
  });

  describe("invalid input", () => {
    // Zod errors are answered with 400, although the OpenAPI text says 422.
    it.each([
      [
        "a current password shorter than 8 characters",
        { currentPassword: "Old1", confirmPassword: NEW_PASSWORD },
      ],
      [
        "a new password without an upper case letter",
        { currentPassword: OLD_PASSWORD, confirmPassword: "newpassw0rd" },
      ],
      [
        "a new password without a digit",
        { currentPassword: OLD_PASSWORD, confirmPassword: "NewPassword" },
      ],
      [
        "a new password shorter than 8 characters",
        { currentPassword: OLD_PASSWORD, confirmPassword: "Np1" },
      ],
      [
        "a new password longer than 64 characters",
        {
          currentPassword: OLD_PASSWORD,
          confirmPassword: "Aa1" + "x".repeat(62),
        },
      ],
      ["a missing new password", { currentPassword: OLD_PASSWORD }],
      ["a missing current password", { confirmPassword: NEW_PASSWORD }],
    ])(
      "answers 400 for %s and keeps the stored password",
      async (_name, body) => {
        const before = await storedHash();
        const res = await call(body);
        await expectStatusCode(res, 400);
        expect(await storedHash()).toBe(before);
      },
    );
  });
});
