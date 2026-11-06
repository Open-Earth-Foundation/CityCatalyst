import { describe, expect, it } from "@jest/globals";
import {
  applyActivityClassRules,
  hasLossOrConsumptionLabel,
  type ClassifiableRow,
} from "@/util/GHGI/activity-class-rules";

const row = (overrides: Partial<ClassifiableRow>): ClassifiableRow => ({
  sector: "Stationary Energy",
  subsector: "Non-Specified Sources",
  refSource: "inferred",
  ...overrides,
});

const apply = (r: ClassifiableRow) => applyActivityClassRules([r])[0];

const fixtures: ClassifiableRow[] = [
  row({ activityClass: "grid_energy", gpcRefNo: "I.6.1", scope: "1", originalScope: "1" }),
  row({ activityClass: "td_losses", gpcRefNo: "I.4.4" }),
  row({ activityClass: "td_losses", subsector: "Energy Industries", scope: "3" }),
  row({ activityClass: "grid_energy", subsector: "Energy Industries", scope: "2" }),
  row({ activityClass: "grid_energy", subsector: "Residential Buildings", gpcRefNo: "I.1.1" }),
  row({ activityClass: "grid_energy", sector: "Industrial Processes And Product Uses Ippu", subsector: "Industrial Processes", gpcRefNo: "IV.1" }),
  row({ activityClass: "grid_energy", sector: "", subsector: "Unknown" }),
  row({ activityClass: "td_losses", gpcRefNo: "I.4.4", refSource: "document" }),
  row({ activityClass: "fuel_combustion", gpcRefNo: "II.1.3", scope: "3" }),
  row({ activityClass: "product_use", sector: "Industrial Processes And Product Uses Ippu", subsector: "Product Use", gpcRefNo: "IV.1", scope: "1" }),
  row({ activityClass: "industrial_process", sector: "Industrial Processes And Product Uses Ippu", subsector: "Industrial Processes", gpcRefNo: "IV.2", scope: "1" }),
  row({ activityClass: "product_use", subsector: "Residential Buildings", gpcRefNo: "I.1.1" }),
  row({ activityClass: "grid_supply", gpcRefNo: "I.4.1" }),
];

describe("applyActivityClassRules", () => {
  it("moves grid_energy to scope 2", () => {
    const out = apply(fixtures[0]);
    expect(out).toMatchObject({ gpcRefNo: "I.6.2", scope: "2", scopeSource: "inferred", originalScope: "1" });
  });

  it("moves td_losses to scope 3 off I.4.4", () => {
    expect(apply(fixtures[1])).toMatchObject({ gpcRefNo: "I.6.3", scope: "3" });
  });

  it("uses non-specified sources for Energy Industries", () => {
    expect(apply(fixtures[2])).toMatchObject({ gpcRefNo: "I.6.3", scope: "3" });
    expect(apply(fixtures[3])).toMatchObject({ gpcRefNo: "I.6.2", scope: "2" });
  });

  it("keeps the row's own sub-sector when usable", () => {
    expect(apply(fixtures[4])).toMatchObject({ gpcRefNo: "I.1.2", scope: "2" });
  });

  it("falls back for an IPPU sector, and for unknown labels", () => {
    expect(apply(fixtures[5])).toMatchObject({ gpcRefNo: "I.6.2", scopeSource: "inferred" });
    expect(apply(fixtures[6])).toMatchObject({ gpcRefNo: "I.6.2", scope: "2" });
  });

  it("never changes a document-sourced row", () => {
    expect(apply(fixtures[7])).toEqual(fixtures[7]);
  });

  it("leaves fuel_combustion alone", () => {
    expect(apply(fixtures[8])).toEqual(fixtures[8]);
  });

  it("maps IPPU classes", () => {
    expect(apply(fixtures[9])).toMatchObject({ gpcRefNo: "IV.2", scope: "1" });
    expect(apply(fixtures[10])).toMatchObject({ gpcRefNo: "IV.1" });
    expect(apply(fixtures[11])).toEqual(fixtures[11]);
  });

  it("maps grid_supply to I.4.4", () => {
    expect(apply(fixtures[12]).gpcRefNo).toBe("I.4.4");
  });

  it("passes other, null and legacy rows through", () => {
    const rows: ClassifiableRow[] = [
      row({ activityClass: "other", sector: "Waste", subsector: "Biological Treatment", gpcRefNo: "III.1.3", directionEvidence: "x" } as ClassifiableRow),
      row({ activityClass: null, gpcRefNo: "V.1" }),
      row({ activityClass: "other", gpcRefNo: "VI.1" }),
      { sector: "Stationary Energy", subsector: "Non-Specified Sources", refSource: "inferred", gpcRefNo: "I.6.1", category: "Electricity T&D Losses" } as ClassifiableRow,
    ];
    expect(applyActivityClassRules(rows)).toEqual(rows);
  });

  it("only grid_supply rows end on I.4.4", () => {
    for (const r of applyActivityClassRules(fixtures)) {
      if (r.gpcRefNo === "I.4.4" && r.refSource !== "document") {
        expect(r.activityClass).toBe("grid_supply");
      }
    }
  });
});

describe("hasLossOrConsumptionLabel", () => {
  it("detects loss and consumption labels", () => {
    expect(hasLossOrConsumptionLabel("Electricity T&D Losses")).toBe(true);
    expect(hasLossOrConsumptionLabel("Perdas na rede")).toBe(true);
    expect(hasLossOrConsumptionLabel("Consumo eléctrico")).toBe(true);
    expect(hasLossOrConsumptionLabel("Electricity supplied to grid")).toBe(false);
  });
});
