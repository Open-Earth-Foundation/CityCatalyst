/**
 * Unit tests for the city-switch module-preservation logic (CC-742).
 */
import { describe, expect, it } from "@jest/globals";
import { Modules } from "@/util/constants";
import {
  getActiveModuleSegment,
  resolveCitySwitchPath,
} from "@/util/module-navigation";

describe("getActiveModuleSegment", () => {
  it("returns null for a pathname with no recognized module", () => {
    expect(getActiveModuleSegment("/en/cities/city-a")).toBeNull();
  });

  it("returns null for a null pathname", () => {
    expect(getActiveModuleSegment(null)).toBeNull();
  });

  it("detects GHGI", () => {
    expect(
      getActiveModuleSegment("/en/cities/city-a/GHGI/inventory-1")?.segment,
    ).toBe("GHGI");
  });

  it("detects HIAP", () => {
    expect(
      getActiveModuleSegment("/en/cities/city-a/HIAP/inventory-1")?.segment,
    ).toBe("HIAP");
  });

  it("detects dashboard", () => {
    expect(getActiveModuleSegment("/en/cities/city-a/dashboard")?.segment).toBe(
      "dashboard",
    );
  });
});

describe("resolveCitySwitchPath", () => {
  const lng = "en";
  const newCityId = "city-b";

  it("falls back to the Journey Navigator when there's no active module", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a",
      lng,
      newCityId,
      availableModuleIds: new Set(),
    });
    expect(result).toEqual({ path: "/en/cities/city-b" });
  });

  it("preserves the dashboard route since it isn't access-gated", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/dashboard",
      lng,
      newCityId,
      availableModuleIds: new Set(),
    });
    expect(result).toEqual({ path: "/en/cities/city-b/dashboard" });
  });

  it("preserves the module route when the new city's project has access", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/GHGI/inventory-1",
      lng,
      newCityId,
      availableModuleIds: new Set([Modules.GHGI.id]),
    });
    expect(result).toEqual({ path: "/en/cities/city-b/GHGI" });
  });

  it("falls back to the Journey Navigator and flags the blocked module when access is missing", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/HIAP/inventory-1",
      lng,
      newCityId,
      availableModuleIds: new Set([Modules.GHGI.id]),
    });
    expect(result).toEqual({
      path: "/en/cities/city-b",
      blockedModuleId: Modules.HIAP.id,
    });
  });
});
