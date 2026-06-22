import { describe, expect, it } from "@jest/globals";
import {
  stationaryEnergyScopeIdentity,
  stationaryEnergyScopeMatchesTarget,
} from "@/backend/agentic/ghgi/stationary-energy/scope";

describe("stationaryEnergyScopeIdentity", () => {
  it("returns null when the scope input is missing", () => {
    expect(stationaryEnergyScopeIdentity(null)).toBeNull();
  });

  it("returns named scope fields for real inputs", () => {
    expect(
      stationaryEnergyScopeIdentity({
        sector_reference_number: "I",
        subsector_reference_number: "I.1",
        subcategory_reference_number: "I.1.1",
        scope_id: "scope-1",
      }),
    ).toEqual({
      sector: "I",
      subsector: "I.1",
      subcategory: "I.1.1",
      scopeId: "scope-1",
    });
  });
});

describe("stationaryEnergyScopeMatchesTarget", () => {
  it("matches when the source satisfies the target scope", () => {
    expect(
      stationaryEnergyScopeMatchesTarget(
        {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
        },
        {
          sector_reference_number: "I",
          subsector_reference_number: "I.1",
          subcategory_reference_number: "I.1.1",
        },
      ),
    ).toBe(true);
  });

  it("rejects a target with no scope identity", () => {
    expect(
      stationaryEnergyScopeMatchesTarget(
        {},
        { sector_reference_number: "I" },
      ),
    ).toBe(false);
  });

  it("rejects mismatched scoped values", () => {
    expect(
      stationaryEnergyScopeMatchesTarget(
        { subsector_reference_number: "I.1" },
        { subsector_reference_number: "I.2" },
      ),
    ).toBe(false);
  });
});
