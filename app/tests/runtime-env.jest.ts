import { afterEach, describe, expect, it } from "@jest/globals";

import { getPublicRuntimeEnv } from "@/lib/runtime-env/keys";

describe("getPublicRuntimeEnv", () => {
  const originalFlags = process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  const originalOpenClimate = process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL;

  afterEach(() => {
    if (originalFlags === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_FLAGS;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_FLAGS = originalFlags;
    }

    if (originalOpenClimate === undefined) {
      delete process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL;
    } else {
      process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL = originalOpenClimate;
    }
  });

  it("returns only allowlisted keys that are present on process.env", () => {
    delete process.env.NEXT_PUBLIC_FEATURE_FLAGS;
    delete process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL;

    expect(getPublicRuntimeEnv()).toEqual({});

    process.env.NEXT_PUBLIC_FEATURE_FLAGS = "ENTERPRISE_MODE,CA_SERVICE_INTEGRATION";
    process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL = "https://example.test";

    expect(getPublicRuntimeEnv()).toEqual({
      NEXT_PUBLIC_FEATURE_FLAGS: "ENTERPRISE_MODE,CA_SERVICE_INTEGRATION",
      NEXT_PUBLIC_OPENCLIMATE_API_URL: "https://example.test",
    });
  });
});
