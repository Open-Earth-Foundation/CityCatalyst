/**
 * Unit tests for the city-switch module-preservation logic (CC-742).
 */
import { describe, expect, it } from "@jest/globals";
import { Modules } from "@/util/constants";
import {
  getActiveModuleSegment,
  resolveCitySwitchPath,
} from "@/util/module-navigation";
import type { ModuleAttributes } from "@/models/Module";

function makeModule(
  id: string,
  url: string,
  name = { en: "Module" },
): ModuleAttributes {
  return {
    id,
    url,
    name,
    stage: "assess-&-analyze",
    type: "OEF",
    status: "active",
    author: "OEF",
  };
}

const modules: ModuleAttributes[] = [
  makeModule(Modules.GHGI.id, "/GHGI", { en: "GHG Inventories" }),
  makeModule(Modules.HIAP.id, "/HIAP", { en: "Actions & Plans" }),
  makeModule(Modules.MEED.id, "/MEED", { en: "Actions & Plans v2" }),
];

describe("getActiveModuleSegment", () => {
  it("returns null for a pathname with no recognized module", () => {
    expect(getActiveModuleSegment("/en/cities/city-a", modules)).toBeNull();
  });

  it("returns null for a null pathname", () => {
    expect(getActiveModuleSegment(null, modules)).toBeNull();
  });

  it("detects GHGI from the module's url", () => {
    expect(
      getActiveModuleSegment(
        "/en/cities/city-a/GHGI/inventory-1",
        modules,
      )?.segment,
    ).toBe("GHGI");
  });

  it("detects HIAP from the module's url", () => {
    expect(
      getActiveModuleSegment(
        "/en/cities/city-a/HIAP/inventory-1",
        modules,
      )?.segment,
    ).toBe("HIAP");
  });

  it("detects dashboard even though it has no module row", () => {
    expect(
      getActiveModuleSegment("/en/cities/city-a/dashboard", modules)?.segment,
    ).toBe("dashboard");
  });

  it("ignores modules whose url points to an external tool", () => {
    const withExternal = [
      ...modules,
      makeModule("external-1", "https://example.replit.app"),
    ];
    expect(
      getActiveModuleSegment(
        "/en/cities/city-a/external-1/foo",
        withExternal,
      ),
    ).toBeNull();
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
      modules,
      availableModuleIds: new Set(),
    });
    expect(result).toEqual({ path: "/en/cities/city-b" });
  });

  it("preserves the dashboard route since it isn't access-gated", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/dashboard",
      lng,
      newCityId,
      modules,
      availableModuleIds: new Set(),
    });
    expect(result).toEqual({ path: "/en/cities/city-b/dashboard" });
  });

  it("preserves the module route when the new city's project has access", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/GHGI/inventory-1",
      lng,
      newCityId,
      modules,
      availableModuleIds: new Set([Modules.GHGI.id]),
    });
    expect(result).toEqual({ path: "/en/cities/city-b/GHGI" });
  });

  it("falls back to the Journey Navigator and flags the blocked module when access is missing", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/HIAP/inventory-1",
      lng,
      newCityId,
      modules,
      availableModuleIds: new Set([Modules.GHGI.id]),
    });
    expect(result).toEqual({
      path: "/en/cities/city-b",
      blockedModuleId: Modules.HIAP.id,
    });
  });

  it("preserves the MEED route when the new city's project has access", () => {
    const result = resolveCitySwitchPath({
      pathname: "/en/cities/city-a/MEED/inventory-1",
      lng,
      newCityId,
      modules,
      availableModuleIds: new Set([Modules.MEED.id]),
    });
    expect(result).toEqual({ path: "/en/cities/city-b/MEED" });
  });
});
