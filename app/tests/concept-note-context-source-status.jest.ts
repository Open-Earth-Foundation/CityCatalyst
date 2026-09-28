import {
  contextSourceStatusKey,
  contextSourceTone,
  getCitySourceState,
  getRunSourceState,
  inventorySourceAction,
  isSourceLookupFailure,
} from "@/components/ConceptNoteDashboard/context-source-status";

describe("concept-note context source status", () => {
  it("distinguishes a city inventory from evidence included in a run", () => {
    expect(getCitySourceState(true)).toBe("available");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        bundleStatus: "ready",
        sourceStatus: "missing",
      }),
    ).toBe("available");
    expect(contextSourceStatusKey("available")).toBe("available-in-city");
    expect(contextSourceTone("available")).toBe("positive");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: true,
        bundleStatus: "ready",
        sourceStatus: "included",
      }),
    ).toBe("included");
  });

  it("keeps missing, selected, processing, and failed states distinct", () => {
    expect(getCitySourceState(false)).toBe("unavailable");
    expect(contextSourceTone("unavailable")).toBe("neutral");
    expect(getCitySourceState(false, true)).toBe("failed");
    expect(contextSourceTone("failed")).toBe("warning");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        selected: true,
        bundleStatus: "ready",
      }),
    ).toBe("selected");
    expect(contextSourceTone("selected")).toBe("positive");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        bundleStatus: "building",
      }),
    ).toBe("processing");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        bundleStatus: "ready",
        sourceStatus: "unavailable",
      }),
    ).toBe("unavailable");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        bundleStatus: "failed",
      }),
    ).toBe("failed");
  });

  it("reports an inventory with no data as empty in the city and the run", () => {
    expect(getCitySourceState(true, false, true)).toBe("empty");
    expect(getCitySourceState(false, false, true)).toBe("unavailable");
    expect(contextSourceStatusKey("empty")).toBe("inventory-empty");
    expect(contextSourceTone("empty")).toBe("warning");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: true,
        bundleStatus: "ready",
        empty: true,
      }),
    ).toBe("empty");
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: false,
        bundleStatus: "building",
        empty: true,
      }),
    ).toBe("processing");
  });

  it("treats a missing inventory (404) as unavailable, not failed", () => {
    expect(isSourceLookupFailure(undefined)).toBe(false);
    expect(isSourceLookupFailure({ status: 404 })).toBe(false);
    expect(isSourceLookupFailure({ status: 500 })).toBe(true);
    expect(isSourceLookupFailure({ status: "FETCH_ERROR" })).toBe(true);
  });

  it("marks an included source with missing sectors as partial", () => {
    expect(
      getRunSourceState({
        cityAvailable: true,
        included: true,
        bundleStatus: "ready",
        sourceStatus: "partial",
      }),
    ).toBe("partial");
    expect(contextSourceStatusKey("partial")).toBe("included-partial");
    expect(contextSourceTone("partial")).toBe("warning");
  });

  it("picks the inventory card's next step from the state", () => {
    const where = { lng: "en", cityId: "city-1" };
    expect(
      inventorySourceAction("unavailable", { ...where, inventoryId: null }),
    ).toEqual({
      kind: "create",
      labelKey: "create-inventory",
      href: "/en/cities/city-1/GHGI/onboarding",
    });
    expect(
      inventorySourceAction("empty", { ...where, inventoryId: "inv-1" }),
    ).toEqual({
      kind: "fill",
      labelKey: "add-inventory-data",
      href: "/en/cities/city-1/GHGI/inv-1/data",
    });
    for (const state of ["available", "included", "partial"] as const) {
      expect(
        inventorySourceAction(state, { ...where, inventoryId: "inv-1" })?.kind,
      ).toBe("choose");
    }
    expect(
      inventorySourceAction("failed", { ...where, inventoryId: null }),
    ).toBeUndefined();
    expect(
      inventorySourceAction("processing", { ...where, inventoryId: "inv-1" }),
    ).toBeUndefined();
  });
});
