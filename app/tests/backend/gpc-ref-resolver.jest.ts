import { describe, expect, it } from "@jest/globals";
import {
  resolveGpcRefFromLabels,
  resolveGpcRefNo,
} from "@/util/GHGI/gpc-ref-resolver";

describe("resolveGpcRefNo scope", () => {
  it("stores indirect grid electricity as scope 2", () => {
    expect(
      resolveGpcRefNo(
        "Stationary Energy",
        "Residential Buildings",
        "Electricity",
        "Indirect emissions",
      ),
    ).toBe("I.1.2");
    expect(
      resolveGpcRefNo(
        "Stationary Energy",
        "Commercial buildings & facilities",
        "Electricity",
        "Indirect emissions",
      ),
    ).toBe("I.2.2");
  });

  it("keeps direct fuel combustion on scope 1", () => {
    expect(
      resolveGpcRefNo(
        "Stationary Energy",
        "Residential Buildings",
        "Natural gas",
        "Direct emissions",
      ),
    ).toBe("I.1.1");
  });

  it("does not use the scope 1 row when the scope label is indirect", () => {
    expect(
      resolveGpcRefNo(
        "Stationary Energy",
        "Residential Buildings",
        undefined,
        "Indirect emissions",
      ),
    ).toBe("I.1.2");
  });

  it("maps CRF energy generation to generation supplied to the grid", () => {
    expect(
      resolveGpcRefNo(
        "Energy generation",
        "Electricity-only generation",
        "Fuel type 1 (Liquid fuels)",
        "Direct emissions",
      ),
    ).toBe("I.4.4");
    expect(
      resolveGpcRefNo(
        "Energy generation",
        "Electricity-only generation",
        "Electricity",
        "Indirect emissions",
      ),
    ).toBe("I.4.2");
  });

  it("returns null when the sector is not in the GPC table", () => {
    expect(
      resolveGpcRefNo(
        "Not a sector",
        "Nope",
        "Natural gas",
        "Direct emissions",
      ),
    ).toBeNull();
  });
});

describe("resolveGpcRefFromLabels", () => {
  it("uses the left side of a transport sub-sector split and the scope label", () => {
    expect(
      resolveGpcRefFromLabels({
        sector: "Transportation",
        subsector: "On-road > Passenger car",
        fuelTypeOrActivity: "Electricity",
        scopeLabel: "Indirect emissions",
      }),
    ).toBe("II.1.2");
    expect(
      resolveGpcRefFromLabels({
        sector: "Transportation",
        subsector: "Rail > Other/uncategorized",
        fuelTypeOrActivity: "Diesel oil",
        scopeLabel: "Direct emissions",
      }),
    ).toBe("II.2.1");
  });
});
