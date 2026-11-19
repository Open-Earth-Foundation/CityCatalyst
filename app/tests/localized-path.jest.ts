/**
 * Unit tests for getLocalizedPath, used by the navigation bar language switcher.
 */
import { describe, expect, it } from "@jest/globals";
import { getLocalizedPath } from "@/util/routes";

describe("getLocalizedPath", () => {
  it("swaps the locale segment", () => {
    expect(getLocalizedPath("/en/cities/", "pt")).toBe("/pt/cities/");
  });

  it("swaps a bare locale path", () => {
    expect(getLocalizedPath("/en", "es")).toBe("/es");
  });

  it("preserves the query string (callbackUrl on login)", () => {
    expect(
      getLocalizedPath(
        "/en/auth/login/",
        "pt",
        "?callbackUrl=%2Fen%2Fcities%2F",
      ),
    ).toBe("/pt/auth/login/?callbackUrl=%2Fen%2Fcities%2F");
  });

  it("preserves token query params and hash", () => {
    expect(
      getLocalizedPath("/en/auth/reset/", "de", "?token=abc&email=x", "#top"),
    ).toBe("/de/auth/reset/?token=abc&email=x#top");
  });

  it("does not touch segments that only start with two letters", () => {
    expect(getLocalizedPath("/english/page", "pt")).toBe("/english/page");
  });
});
