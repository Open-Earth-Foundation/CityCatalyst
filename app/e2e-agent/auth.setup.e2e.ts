import { test } from "@e2e-dev/web";
import { expect } from "e2e";

import { ADMIN_SESSION, signInCookies } from "./support/citycatalyst.ts";

test.setup(
  "sign in the e2e admin",
  { sessions: [ADMIN_SESSION] },
  async ({ app, browser, session }) => {
    await browser.setCookies(await signInCookies(app.baseUrl!));
    await app.open("/en/cities/");

    await expect(browser).not.toHaveURL(/\/auth\/login/);
    await session.save(ADMIN_SESSION);
  },
);
