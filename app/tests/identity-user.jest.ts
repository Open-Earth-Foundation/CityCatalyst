import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { db } from "@/models";
import { ensureLocalUserFromOidc } from "@/lib/identity-user";
import { Roles } from "@/util/types";
import { setupTests } from "./helpers";

describe("ensureLocalUserFromOidc", () => {
  const sub = randomUUID();
  const email = `oidc-${sub.slice(0, 8)}@example.com`;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.models.User.destroy({ where: { userId: sub } });
    if (db.sequelize) await db.sequelize.close();
  });

  it("creates a profile row without credentials on first login", async () => {
    const result = await ensureLocalUserFromOidc({
      sub,
      email,
      name: "OIDC Tester",
    });

    expect(result).toEqual({
      id: sub,
      email,
      name: "OIDC Tester",
      role: Roles.User,
    });

    const row = await db.models.User.findByPk(sub);
    expect(row).not.toBeNull();
    expect(row!.passwordHash).toBeFalsy();
    expect(row!.email).toBe(email);
  });

  it("updates email and stamps lastActiveAt for an existing user", async () => {
    const nextEmail = `oidc-updated-${sub.slice(0, 8)}@example.com`;
    const before = await db.models.User.findByPk(sub);
    const previousActive = before!.lastActiveAt;

    const result = await ensureLocalUserFromOidc({
      sub,
      email: nextEmail,
      name: "OIDC Updated",
    });

    expect(result.email).toBe(nextEmail);
    expect(result.name).toBe("OIDC Updated");
    expect(result.role).toBe(Roles.User);

    await before!.reload();
    expect(before!.email).toBe(nextEmail);
    expect(before!.name).toBe("OIDC Updated");
    expect(before!.lastActiveAt?.getTime()).toBeGreaterThanOrEqual(
      previousActive?.getTime() ?? 0,
    );
  });

  it("rejects a missing sub", async () => {
    await expect(
      ensureLocalUserFromOidc({ sub: "", email: "x@example.com" }),
    ).rejects.toThrow(/missing sub/);
  });
});
