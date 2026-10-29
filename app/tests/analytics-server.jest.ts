import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: { ANALYTICS_ENABLED: "ANALYTICS_ENABLED" },
  hasServerFeatureFlag: jest.fn(),
}));
jest.mock("@/util/feature-flags", () => ({
  FeatureFlags: { ANALYTICS_ENABLED: "ANALYTICS_ENABLED" },
  hasServerFeatureFlag: jest.fn(),
}));
jest.unstable_mockModule("@/lib/runtime-env", () => ({
  env: jest.fn(),
}));
jest.mock("@/lib/runtime-env", () => ({
  env: jest.fn(),
}));

const { hasServerFeatureFlag } = await import("@/util/feature-flags");
const { env } = await import("@/lib/runtime-env");
const { trackServerPageView } = await import("@/lib/analytics-server");

const mockedHasServerFeatureFlag = hasServerFeatureFlag as jest.MockedFunction<
  typeof hasServerFeatureFlag
>;
const mockedEnv = env as jest.MockedFunction<typeof env>;

describe("trackServerPageView", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    // trackServerPageView short-circuits under NODE_ENV === "test" (which Jest
    // sets by default) so it never fires real capture calls during the suite.
    // Tests exercising the other guards need that guard out of the way.
    jest.replaceProperty(process.env, "NODE_ENV", "production");

    mockedHasServerFeatureFlag.mockReturnValue(true);
    mockedEnv.mockImplementation((key: string) => {
      if (key === "NEXT_PUBLIC_POSTHOG_KEY") return "phc_test_key";
      if (key === "NEXT_PUBLIC_POSTHOG_HOST") return "https://posthog.test";
      return undefined;
    });
  });

  afterEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "test");
  });

  it("captures a pageview when the feature flag is on and consent was granted", () => {
    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: "subject-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://posthog.test/capture/");
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      api_key: "phc_test_key",
      event: "$pageview",
      distinct_id: "subject-123",
      properties: { $current_url: "/en/cities/city-1" },
    });
  });

  it("does not capture when the analytics feature flag is off", () => {
    mockedHasServerFeatureFlag.mockReturnValue(false);

    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: "subject-123",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not capture when analytics consent was not granted", () => {
    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "false",
      subjectKey: "subject-123",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not capture when there is no consent subject key", () => {
    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: undefined,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not capture when the PostHog key is not configured", () => {
    mockedEnv.mockReturnValue(undefined);

    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: "subject-123",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not capture in a test environment", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "test");

    trackServerPageView({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: "subject-123",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not capture when running under Playwright", () => {
    process.env.PLAYWRIGHT_TEST = "1";

    try {
      trackServerPageView({
        pathname: "/en/cities/city-1",
        consentCookie: "true",
        subjectKey: "subject-123",
      });

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete process.env.PLAYWRIGHT_TEST;
    }
  });
});
