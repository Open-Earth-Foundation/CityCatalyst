/**
 * CC-944: a GPC activity extract (gpc_ref_no + gases) stays on the
 * deterministic column mapper. It must not be classified as long-tidy.
 */
import { describe, expect, it } from "@jest/globals";
import FormatAdapterService from "@/backend/FormatAdapterService";
import type { ParsedFileData } from "@/backend/FileParserService";
import FileValidatorService from "@/backend/FileValidatorService";
import { countRowsWithEmptyEmissionCells } from "@/util/empty-emission-rows";
import { inferInventoryYearFromSheets } from "@/util/infer-inventory-year";

const BUENOS_AIRES_HEADERS = [
  "gpc_ref_no",
  "sector",
  "subsector",
  "activity_name",
  "activity_amount",
  "scope",
  "co2",
  "ch4",
  "n2o",
  "total_co2e",
  "year",
];

function parsedFile(
  headers: string[],
  row: Record<string, string | number | null>,
): ParsedFileData {
  const sheet = {
    name: "Sheet1",
    headers,
    rows: [row],
    rowCount: 2,
    columnCount: headers.length,
  };
  return { sheets: [sheet], primarySheet: sheet, fileType: "xlsx" };
}

describe("GPC activity extract detection", () => {
  it("does not treat a gpc_ref_no sheet as long-tidy", () => {
    const parsed = parsedFile(BUENOS_AIRES_HEADERS, {
      gpc_ref_no: "I.1.1",
      sector: "Stationary Energy",
      subsector: "Residential",
      activity_name: "Natural gas",
      activity_amount: 10,
      scope: "1",
      co2: null,
      ch4: null,
      n2o: null,
      total_co2e: 12.5,
      year: 2020,
    });

    expect(FormatAdapterService.detect(parsed).adapterType).toBeNull();
  });

  it("still detects a year + sector + emissions sheet as long-tidy", () => {
    const parsed = parsedFile(
      ["Year", "Sector", "GHG emissions (mt CO2e)"],
      {
        Year: 2020,
        Sector: "Waste",
        "GHG emissions (mt CO2e)": 100,
      },
    );

    expect(FormatAdapterService.detect(parsed).adapterType).toBe("long-tidy");
  });

  it("maps snake_case GPC columns onto the eCRF fields", () => {
    const columns = FileValidatorService.detectRequiredColumns(
      BUENOS_AIRES_HEADERS,
    );

    expect(columns.gpcRefNo).toBe(0);
    expect(columns.sector).toBe(1);
    expect(columns.subsector).toBe(2);
    expect(columns.activityType).toBe(3);
    expect(columns.activityAmount).toBe(4);
    expect(columns.scope).toBe(5);
    expect(columns.co2).toBe(6);
    expect(columns.ch4).toBe(7);
    expect(columns.n2o).toBe(8);
    expect(columns.totalCO2e).toBe(9);
    expect(columns.year).toBe(10);
    expect(FileValidatorService.hasDistinctRequiredECRFColumns(columns)).toBe(
      true,
    );
  });

  it("counts a row when any gas or total CO2e cell is blank", () => {
    const columns = FileValidatorService.detectRequiredColumns(
      BUENOS_AIRES_HEADERS,
    );
    const count = countRowsWithEmptyEmissionCells(
      BUENOS_AIRES_HEADERS,
      [
        {
          gpc_ref_no: "I.1.1",
          co2: 1,
          ch4: 2,
          n2o: 3,
          total_co2e: 6,
        },
        {
          gpc_ref_no: "I.1.2",
          co2: null,
          ch4: null,
          n2o: null,
          total_co2e: 10,
        },
        {
          gpc_ref_no: "I.1.3",
          co2: 4,
          ch4: 0,
          n2o: 1,
          total_co2e: "",
        },
      ],
      columns,
    );

    expect(count).toBe(2);
  });

  it("reads the inventory year from a details sheet label", () => {
    const year = inferInventoryYearFromSheets([
      {
        headers: ["Field", "Value"],
        rows: [
          { Field: "City", Value: "Buenos Aires" },
          { Field: "Inventory year", Value: 2018 },
        ],
      },
    ]);

    expect(year).toBe(2018);
  });
});
