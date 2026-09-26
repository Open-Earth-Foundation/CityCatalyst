/**
 * IMP-013: Adapter D (the CRFFormat / near-eCRF path) must keep negative totalCO2e.
 */
import { describe, expect, it } from "@jest/globals";
import FormatAdapterService from "@/backend/FormatAdapterService";
import type { ParsedFileData } from "@/backend/FileParserService";

const GHGS_TOTAL = "GHGs (metric tonnes CO2e) - Total CO2e";
const EF_TOTAL = "Emission factor - Total CO2e";

function nearEcrfFile(
  totalCO2e: unknown,
  extra?: Record<string, string | number | null>,
): ParsedFileData {
  const headers = [
    "Inventory year",
    "GPC ref. no.",
    "CRF - Sector",
    "CRF - Sub-sector",
    "Scope",
    "Fuel type or activity",
    "Notation key",
    "Activity data - Amount",
    "Activity data - Unit",
    EF_TOTAL,
    GHGS_TOTAL,
  ];
  const row: Record<string, string | number | null> = {
    "Inventory year": 2023,
    "GPC ref. no.": null,
    "CRF - Sector": "Agriculture, Forestry and Other Land Use",
    "CRF - Sub-sector": "Land",
    Scope: "Direct emissions",
    "Fuel type or activity": "Forest land remaining forest land",
    "Notation key": null,
    "Activity data - Amount": 10,
    "Activity data - Unit": "ha",
    [EF_TOTAL]: 1.2,
    [GHGS_TOTAL]: totalCO2e as string | number | null,
    ...extra,
  };
  const sheet = {
    name: "eCRF_3",
    headers,
    rows: [row],
    rowCount: 2,
    columnCount: headers.length,
  };
  return { sheets: [sheet], primarySheet: sheet, fileType: "xlsx" };
}

describe("FormatAdapterService Adapter D removals", () => {
  it("detects CRFFormat headers as near-ecrf", () => {
    const parsed = nearEcrfFile(-239.5);
    expect(FormatAdapterService.detect(parsed).adapterType).toBe("near-ecrf");
  });

  it("reads GHGs total CO2e, not the emission-factor column", () => {
    const rows = FormatAdapterService.toExtractedRows(nearEcrfFile(2465.5));
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCO2e).toBe(2465.5);
  });

  it("keeps a negative GHGs total as a removal", () => {
    const rows = FormatAdapterService.toExtractedRows(nearEcrfFile(-239.5));
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCO2e).toBe(-239.5);
  });

  it("parses unicode minus in the GHGs total column", () => {
    const rows = FormatAdapterService.toExtractedRows(nearEcrfFile("−239.5"));
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCO2e).toBe(-239.5);
  });

  it("does not treat totalCO2e 0 as a removal row without a notation key", () => {
    const rows = FormatAdapterService.toExtractedRows(nearEcrfFile(0));
    expect(rows[0]?.totalCO2e).toBe(0);
  });

  it("detects Chile MEED CSVs (GPC ref + totals, no notation) as near-ecrf", () => {
    const headers = [
      "Inventory Reference",
      "GPC Reference Number",
      "Subsector name",
      "Total Emissions",
      "Total Emission Units",
    ];
    const sheet = {
      name: "Sheet1",
      headers,
      rows: [
        {
          "Inventory Reference": "x",
          "GPC Reference Number": "I.1.1",
          "Subsector name": "Residential buildings",
          "Total Emissions": -12.5,
          "Total Emission Units": "tCO2e",
        },
      ],
      rowCount: 2,
      columnCount: headers.length,
    };
    const parsed: ParsedFileData = {
      sheets: [sheet],
      primarySheet: sheet,
      fileType: "csv",
    };
    expect(FormatAdapterService.detect(parsed).adapterType).toBe("near-ecrf");
    const rows = FormatAdapterService.toExtractedRows(parsed, 2022);
    expect(rows).toHaveLength(1);
    expect(rows[0].gpcRefNo).toBe("I.1.1");
    expect(rows[0].totalCO2e).toBe(-12.5);
  });

  it("does not treat bare GPC ref + totals (no notation, no Chile markers) as near-ecrf", () => {
    const headers = ["GPC Reference Number", "Total Emissions", "Sector"];
    const sheet = {
      name: "Sheet1",
      headers,
      rows: [
        {
          "GPC Reference Number": "I.1.1",
          "Total Emissions": 10,
          Sector: "Stationary Energy",
        },
      ],
      rowCount: 2,
      columnCount: headers.length,
    };
    const parsed: ParsedFileData = {
      sheets: [sheet],
      primarySheet: sheet,
      fileType: "csv",
    };
    expect(FormatAdapterService.detect(parsed).adapterType).not.toBe(
      "near-ecrf",
    );
  });
});
