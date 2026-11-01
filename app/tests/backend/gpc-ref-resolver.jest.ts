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

describe("resolveGpcRefNo for PDF extraction rows (CC-1008)", () => {
  it("puts scope 2 and scope 3 of Auckland Table A-1 on their own references", () => {
    const sector = "Stationary Energy";
    const subsector = "Commercial And Institutional Buildings And Facilities";
    expect(resolveGpcRefNo(sector, subsector, undefined, "1")).toBe("I.2.1");
    expect(resolveGpcRefNo(sector, subsector, undefined, "2")).toBe("I.2.2");
    expect(resolveGpcRefNo(sector, subsector, undefined, "3")).toBe("I.2.3");
    expect(resolveGpcRefNo("Transportation", "Aviation", undefined, "3")).toBe(
      "II.4.3",
    );
  });

  it("puts energy generation supplied to the grid on I.4.4, not I.4.1", () => {
    expect(
      resolveGpcRefNo(
        "Stationary Energy",
        "Energy Industries",
        "Energy generation supplied to the grid",
        "1",
      ),
    ).toBe("I.4.4");
    expect(
      resolveGpcRefNo("Stationary Energy", "Energy Industries", undefined, "1"),
    ).toBe("I.4.1");
  });
});
