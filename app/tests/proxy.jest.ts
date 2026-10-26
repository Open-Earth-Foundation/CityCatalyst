import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { NextRequestWithAuth } from "next-auth/middleware";

// `after()` needs a real Next.js request-context store, which doesn't exist
// under Jest — run the callback immediately instead so trackServerPageView
// calls are observable synchronously. NextRequest/NextResponse are captured
// from the real module before mocking so the test's own request-building
// and assertions keep using the genuine classes.
const { NextRequest, NextResponse } = await import("next/server");

jest.unstable_mockModule("next/server", () => ({
  NextRequest,
  NextResponse,
  after: jest.fn((cb: () => void) => cb()),
}));
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server") as typeof import("next/server");
  return {
    ...actual,
    after: jest.fn((cb: () => void) => cb()),
  };
});

jest.unstable_mockModule("next-auth/middleware", () => ({
  withAuth: jest.fn(),
}));
jest.mock("next-auth/middleware", () => ({
  withAuth: jest.fn(),
}));

jest.unstable_mockModule("@/util/legacy-inventory-middleware", () => ({
  maybeRedirectLegacyInventoryUrl: jest.fn(),
}));
jest.mock("@/util/legacy-inventory-middleware", () => ({
  maybeRedirectLegacyInventoryUrl: jest.fn(),
}));

jest.unstable_mockModule("@/lib/analytics-server", () => ({
  trackServerPageView: jest.fn(),
}));
jest.mock("@/lib/analytics-server", () => ({
  trackServerPageView: jest.fn(),
}));

const { withAuth } = await import("next-auth/middleware");
const { maybeRedirectLegacyInventoryUrl } = await import(
  "@/util/legacy-inventory-middleware"
);
const { trackServerPageView } = await import("@/lib/analytics-server");
const { proxy } = await import("@/proxy");

// `withAuth` is overloaded in a way TS can't express via a single mocked
// signature, so cast to a plain async-function mock for setting its resolved value.
const mockedWithAuth = withAuth as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<NextResponse>
>;
const mockedMaybeRedirect = maybeRedirectLegacyInventoryUrl as jest.MockedFunction<
  typeof maybeRedirectLegacyInventoryUrl
>;
const mockedTrackServerPageView = trackServerPageView as jest.MockedFunction<
  typeof trackServerPageView
>;

function buildRequest({
  pathname,
  method = "GET",
  cookie,
  prefetch = false,
}: {
  pathname: string;
  method?: string;
  cookie?: string;
  prefetch?: boolean;
}): NextRequestWithAuth {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (prefetch) headers["next-router-prefetch"] = "1";

  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    method,
    headers,
  }) as unknown as NextRequestWithAuth;
}

describe("proxy middleware server-side page-view tracking", () => {
  beforeEach(() => {
    mockedWithAuth.mockResolvedValue(NextResponse.next());
    mockedMaybeRedirect.mockResolvedValue(null);
  });

  it("tracks a real navigation to a locale-prefixed page", async () => {
    const req = buildRequest({
      pathname: "/en/cities/city-1",
      cookie: "cc_analytics_consent=true; cc_consent_subject=subject-123",
    });

    await proxy(req);

    expect(mockedTrackServerPageView).toHaveBeenCalledWith({
      pathname: "/en/cities/city-1",
      consentCookie: "true",
      subjectKey: "subject-123",
    });
  });

  it("does not track a router prefetch request", async () => {
    const req = buildRequest({
      pathname: "/en/cities/city-1",
      cookie: "cc_analytics_consent=true; cc_consent_subject=subject-123",
      prefetch: true,
    });

    await proxy(req);

    expect(mockedTrackServerPageView).not.toHaveBeenCalled();
  });

  it("does not track non-GET requests", async () => {
    const req = buildRequest({
      pathname: "/en/cities/city-1",
      method: "POST",
      cookie: "cc_analytics_consent=true; cc_consent_subject=subject-123",
    });

    await proxy(req);

    expect(mockedTrackServerPageView).not.toHaveBeenCalled();
  });

  it("passes through missing consent cookies as undefined", async () => {
    const req = buildRequest({ pathname: "/en/cities/city-1" });

    await proxy(req);

    expect(mockedTrackServerPageView).toHaveBeenCalledWith({
      pathname: "/en/cities/city-1",
      consentCookie: undefined,
      subjectKey: undefined,
    });
  });
});
