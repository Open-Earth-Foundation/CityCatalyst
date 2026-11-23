import { expect, test as setup, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { randomBytes } from "node:crypto";
import { db } from "@/models";
import { Roles } from "@/util/types";
import { TEST_ADMIN_EMAIL } from "./test-constants";

const authFile = "playwright/.auth/user.json";

/**
 * Credentials login is gone (CC-1283). Mint a NextAuth JWT for the E2E admin
 * profile created in global-setup so the suite can use storageState as before.
 */
setup("authenticate", async ({ page, baseURL }) => {
  test.setTimeout(60000);

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to mint the E2E session cookie");
  }

  if (!db.initialized) {
    await db.initialize();
  }

  const user = await db.models.User.findOne({
    where: { email: TEST_ADMIN_EMAIL.toLowerCase() },
  });
  if (!user) {
    throw new Error(
      `E2E admin user ${TEST_ADMIN_EMAIL} missing — global-setup create-admin failed`,
    );
  }

  const token = await encode({
    secret,
    token: {
      sub: user.userId,
      email: user.email,
      name: user.name,
      role: user.role ?? Roles.Admin,
      csrfSecret: randomBytes(32).toString("hex"),
    },
  });

  const origin = new URL(baseURL ?? "http://localhost:3000");
  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      domain: origin.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);

  await page.goto("/en/cities");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/cities/, { timeout: 30000 });

  await page.context().storageState({ path: authFile });
});
