import { describe, expect, it } from "@jest/globals";

import { buildRunRankingRequest } from "@/app/[lng]/cities/[cityId]/MEED/meedRankingRequest";
import {
  DEFAULT_MEED_WEIGHTS,
  type MeedStrategicPreferences,
} from "@/app/[lng]/cities/[cityId]/MEED/meedLocalState";

const INVENTORY = "fe5bc1e4-3b0e-4dc0-8c21-f2aed52ae15a";

function preferences(
  overrides: Partial<MeedStrategicPreferences> = {},
): MeedStrategicPreferences {
  return {
    sectors: ["stationary_energy"],
    strategicPriorities: ["air_quality"],
    timeline: ["short"],
    weights: { ...DEFAULT_MEED_WEIGHTS },
    excludedSectors: ["transportation"],
    excludedCoBenefits: ["mobility"],
    excludeText: "anything already under construction",
    ...overrides,
  };
}

describe("MEED run-ranking request", () => {
  it("puts inventoryId at the top level and one entry in cityDataList", () => {
    const body = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences(),
      excludedActionIds: [],
    });
    expect(body.inventoryId).toBe(INVENTORY);
    expect(body.cityDataList).toHaveLength(1);
    expect(body.requestedLanguages).toEqual(["en"]);
    expect(body.topN).toBe(20);
    expect(body.createExplanations).toBe(true);
  });

  it("sends the city's priority sectors, not the excluded ones", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences(),
      excludedActionIds: [],
    }).cityDataList[0];

    expect(city.cityStrategicPreferenceSectors).toEqual(["stationary_energy"]);
    expect(city.cityStrategicPreferenceSectors).not.toContain("transportation");
    expect(city.cityStrategicPreferenceCoBenefitKeys).toEqual(["air_quality"]);
  });

  it("carries the confirmed exclusions as resolved action IDs", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences(),
      excludedActionIds: ["c40_0029", "ipcc_0001"],
    }).cityDataList[0];
    expect(city.excludedActionIds).toEqual(["c40_0029", "ipcc_0001"]);
  });

  it("never sends what the route builds from the database itself", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences(),
      excludedActionIds: [],
    }).cityDataList[0];

    for (const forbidden of [
      "locode",
      "countryCode",
      "populationSize",
      "cityEmissionsData",
    ]) {
      expect(city).not.toHaveProperty(forbidden);
    }
  });

  it("leaves weightsOverride empty when the sliders are untouched", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences(),
      excludedActionIds: [],
    }).cityDataList[0];
    // `{}` means "use your defaults" — restating them would pin this client to
    // today's values if the service ever changes them.
    expect(city.weightsOverride).toEqual({});
  });

  it("converts customised slider percents to the fractions the service reports back", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences({
        weights: { impact: 40, alignment: 30, feasibility: 30 },
      }),
      excludedActionIds: [],
    }).cityDataList[0];

    expect(city.weightsOverride).toEqual({
      impact: 0.4,
      alignment: 0.3,
      feasibility: 0.3,
    });
    const total = Object.values(city.weightsOverride).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(1);
  });

  it("falls back to no_preference when the city picked no timeframe", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: preferences({ timeline: [] }),
      excludedActionIds: [],
    }).cityDataList[0];
    expect(city.cityStrategicPreferenceTimeframes).toEqual(["no_preference"]);
  });

  it("builds a valid body when nothing has been chosen at all", () => {
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: null,
      excludedActionIds: [],
    }).cityDataList[0];

    expect(city).toEqual({
      excludedActionIds: [],
      weightsOverride: {},
      cityStrategicPreferenceSectors: [],
      cityStrategicPreferenceTimeframes: ["no_preference"],
      cityStrategicPreferenceCoBenefitKeys: [],
    });
  });

  it("copies the arrays it is handed rather than aliasing stored state", () => {
    const excluded = ["c40_0029"];
    const prefs = preferences();
    const city = buildRunRankingRequest({
      inventoryId: INVENTORY,
      preferences: prefs,
      excludedActionIds: excluded,
    }).cityDataList[0];

    excluded.push("mutated");
    prefs.sectors.push("waste");
    expect(city.excludedActionIds).toEqual(["c40_0029"]);
    expect(city.cityStrategicPreferenceSectors).toEqual(["stationary_energy"]);
  });
});
