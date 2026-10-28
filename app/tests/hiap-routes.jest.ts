/**
 * Unit tests for city-scoped HIAP URL helpers used by notification emails.
 */
import { afterEach, describe, expect, it } from "@jest/globals";
import {
  buildHiapInventoryUrl,
  getHiapInventoryPath,
} from "@/util/hiap-routes";

describe("hiap-routes", () => {
  const originalHost = process.env.HOST;

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = originalHost;
    }
  });

  it("builds the city-scoped HIAP path", () => {
    expect(
      getHiapInventoryPath(
        "en",
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ),
    ).toBe(
      "/en/cities/11111111-1111-1111-1111-111111111111/HIAP/22222222-2222-2222-2222-222222222222",
    );
  });

  it("builds an absolute email URL from HOST", () => {
    process.env.HOST = "https://citycatalyst.openearth.dev";

    expect(
      buildHiapInventoryUrl(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "es",
      ),
    ).toBe(
      "https://citycatalyst.openearth.dev/es/cities/11111111-1111-1111-1111-111111111111/HIAP/22222222-2222-2222-2222-222222222222",
    );
  });

  it("strips a trailing slash from HOST", () => {
    process.env.HOST = "https://citycatalyst.io/";

    expect(
      buildHiapInventoryUrl(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ),
    ).toBe(
      "https://citycatalyst.io/en/cities/11111111-1111-1111-1111-111111111111/HIAP/22222222-2222-2222-2222-222222222222",
    );
  });
});
