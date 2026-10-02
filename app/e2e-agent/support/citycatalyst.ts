import { randomUUID } from "node:crypto";

import type { Cookie } from "@e2e-dev/web";

import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
} from "../../e2e/test-constants.ts";

/** Session name saved by `auth.setup.e2e.ts` and restored by every test. */
export const ADMIN_SESSION = "admin";

/** Inventory year the UI offers by default and the Playwright suite also uses. */
export function inventoryYear(): number {
  return new Date().getFullYear() - 1;
}

type CookieJar = Map<string, string>;

function storeCookies(jar: CookieJar, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const separator = pair.indexOf("=");
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/**
 * Signs the e2e admin in through the NextAuth credentials endpoint and returns
 * browser cookies. Signing in without filling a password field keeps
 * screenshots available to the agent in every test that restores the session.
 */
export async function signInCookies(baseUrl: string): Promise<Cookie[]> {
  const jar: CookieJar = new Map();
  const csrfResponse = await fetch(new URL("/api/auth/csrf/", baseUrl));
  storeCookies(jar, csrfResponse);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const loginResponse = await fetch(
    new URL("/api/auth/callback/credentials/", baseUrl),
    {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(jar),
      },
      body: new URLSearchParams({
        csrfToken,
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
        callbackUrl: "/en/cities",
        json: "true",
      }),
    },
  );
  storeCookies(jar, loginResponse);
  if (![...jar.keys()].some((name) => name.endsWith("session-token"))) {
    throw new Error(
      `Sign-in returned no session cookie (status ${loginResponse.status}). ` +
        "Run `npm run create-admin` with the e2e admin credentials first.",
    );
  }

  return [
    ...[...jar].map(([name, value]) => ({ url: baseUrl, name, value })),
    // Pre-decline analytics so the consent banner never covers controls.
    { url: baseUrl, name: "cc_analytics_consent", value: "false" },
  ];
}

/** Calls the CityCatalyst REST API with the browser's session cookies. */
export class CityCatalystApi {
  constructor(
    private readonly baseUrl: string,
    private readonly cookies: string,
  ) {}

  static async fromBrowser(
    baseUrl: string,
    browser: { cookies(): Promise<{ name: string; value: string }[]> },
  ): Promise<CityCatalystApi> {
    const cookies = await browser.cookies();
    return new CityCatalystApi(
      baseUrl,
      cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
    );
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // next.config.mjs sets trailingSlash, so unslashed API paths 308-redirect.
    const url = new URL(`/api/v1${path}`, this.baseUrl);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    const response = await fetch(url, {
      method,
      headers: {
        cookie: this.cookies,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `${method} ${path} failed with ${response.status}: ${text.slice(0, 500)}`,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Creates Chicago with population data and a GPC Basic / AR6 inventory, the
   * same records the onboarding wizard creates, without driving the wizard.
   *
   * `POST /city` returns the user's existing city for a known locode and the
   * inventory endpoint returns the existing one for a year, so a fixed locode
   * would share one inventory between tests and runs. A unique locode keeps
   * every test's data its own.
   */
  async createChicagoInventory(): Promise<{
    cityId: string;
    inventoryId: string;
    year: number;
  }> {
    const year = inventoryYear();
    const city = await this.request<{ data: { cityId: string } }>(
      "POST",
      "/city",
      {
        name: "Chicago",
        locode: `XX E2E${randomUUID().slice(0, 8).toUpperCase()}`,
        region: "Illinois",
        country: "United States of America",
        regionLocode: "US-IL",
        countryLocode: "US",
      },
    );
    const { cityId } = city.data;
    await this.request("POST", `/city/${cityId}/population`, {
      cityId,
      cityPopulation: 2_700_000,
      cityPopulationYear: year,
      regionPopulation: 12_500_000,
      regionPopulationYear: year,
      countryPopulation: 335_000_000,
      countryPopulationYear: year,
    });
    const inventory = await this.request<{ data: { inventoryId: string } }>(
      "POST",
      `/city/${cityId}/inventory`,
      {
        inventoryName: `Chicago - ${year}`,
        year,
        inventoryType: "gpc_basic",
        globalWarmingPotentialType: "ar6",
      },
    );
    return { cityId, inventoryId: inventory.data.inventoryId, year };
  }
}
