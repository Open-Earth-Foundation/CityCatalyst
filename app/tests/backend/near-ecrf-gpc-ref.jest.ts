/**
 * Near-eCRF rows with an empty GPC ref column keep scope, fuel, and notation.
 */
import { describe, expect, it } from "@jest/globals";
import FormatAdapterService from "@/backend/FormatAdapterService";
import FileValidatorService from "@/backend/FileValidatorService";
import type { ParsedFileData } from "@/backend/FileParserService";
import { activityDescriptionSample } from "@/util/activity-description-sample";

const GHGS_TOTAL = "GHGs (metric tonnes CO2e) - Total CO2e";
const EF_TOTAL = "Emission factor - Total CO2e";

function sheet(row: Record<string, string | number | null>): ParsedFileData {
  const headers = [
    "Inventory year",
    "GPC ref. no.",
    "CRF - Sector",
    "CRF - Sub-sector",
    "Scope",
    "Fuel type or activity",
    "Notation key",
    "Activity data - Amount",
    "Activity data - Description",
    "Emission factor - CO2",
    EF_TOTAL,
    GHGS_TOTAL,
  ];
  const parsedRow: Record<string, string | number | null> = {
    "Inventory year": 2016,
    "GPC ref. no.": null,
    "CRF - Sector": "Stationary Energy",
    "CRF - Sub-sector": "Residential Buildings",
    Scope: "Indirect emissions",
    "Fuel type or activity": "Electricity",
    "Notation key": null,
    "Activity data - Amount": 100,
    "Activity data - Description": "Fuel consumption from utility bills",
    "Emission factor - CO2": 0.42,
    [EF_TOTAL]: 0.5,
    [GHGS_TOTAL]: 4961667,
    ...row,
  };
  const primarySheet = {
    name: "eCRF_3",
    headers,
    rows: [parsedRow],
    rowCount: 2,
    columnCount: headers.length,
  };
  return { sheets: [primarySheet], primarySheet, fileType: "xlsx" };
}

describe("near-eCRF missing GPC ref", () => {
  it("resolves indirect electricity to I.1.2 and keeps the fuel and factor", () => {
    const { rows, warnings } = FormatAdapterService.extractNearEcrfRows(
      sheet({}),
    );
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].gpcRefNo).toBe("I.1.2");
    expect(rows[0].activityType).toBe("Electricity");
    expect(rows[0].category).toBe("Electricity");
    expect(rows[0].methodology).toBe("Fuel consumption from utility bills");
    expect(rows[0].emissionFactorCO2).toBe(0.42);
    expect(rows[0].emissionFactorTotalCO2e).toBe(0.5);
    expect(rows[0].totalCO2e).toBe(4961667);
  });

  it("resolves energy generation to I.4.4", () => {
    const { rows } = FormatAdapterService.extractNearEcrfRows(
      sheet({
        "CRF - Sector": "Energy generation",
        "CRF - Sub-sector": "Electricity-only generation",
        Scope: "Direct emissions",
        "Fuel type or activity": "Fuel type 1 (Liquid fuels)",
        [GHGS_TOTAL]: 376.88,
      }),
    );
    expect(rows[0].gpcRefNo).toBe("I.4.4");
    expect(rows[0].activityType).toBe("Fuel type 1 (Liquid fuels)");
  });

  it("keeps a notation key when the total is empty", () => {
    const { rows, warnings } = FormatAdapterService.extractNearEcrfRows(
      sheet({
        "Notation key": "NE",
        [GHGS_TOTAL]: null,
      }),
    );
    expect(warnings).toEqual([]);
    expect(rows[0].notationKey).toBe("NE");
    expect(rows[0].gpcRefNo).toBe("I.1.2");
  });

  it("warns when a labelled row has no emissions and no notation key", () => {
    const { rows, warnings } = FormatAdapterService.extractNearEcrfRows(
      sheet({
        "CRF - Sector": "Energy generation",
        "CRF - Sub-sector": "Electricity-only generation",
        Scope: "Direct emissions",
        [GHGS_TOTAL]: null,
      }),
    );
    expect(rows).toHaveLength(0);
    expect(warnings[0]).toContain("no emission values or notation key");
    expect(warnings[0]).toContain("Energy generation");
  });

  it("maps Activity data - Description and shows that example on review", () => {
    const headers = sheet({}).primarySheet?.headers ?? [];
    const detected = FileValidatorService.detectRequiredColumns(headers);
    const descriptionIndex = headers.indexOf("Activity data - Description");
    expect(detected.methodology).toBe(descriptionIndex);
    expect(
      activityDescriptionSample({
        sourceColumn: "Activity data - Description",
        mappedField: "Activity data - Description and Methodology",
        sampleValue: "Fuel consumption from utility bills",
      }),
    ).toBe("Fuel consumption from utility bills");
    expect(
      activityDescriptionSample({
        sourceColumn: "GHGs (metric tonnes CO2e) - Total CO2e",
        mappedField: "Total CO2e",
        sampleValue: "4961667",
      }),
    ).toBeNull();
  });

  it("warns when the sector cannot be resolved", () => {
    const { rows, warnings } = FormatAdapterService.extractNearEcrfRows(
      sheet({
        "CRF - Sector": "Not a sector",
        "CRF - Sub-sector": "Nope",
      }),
    );
    expect(rows[0].gpcRefNo).toBeNull();
    expect(warnings[0]).toContain("Could not resolve a GPC reference");
  });
});
