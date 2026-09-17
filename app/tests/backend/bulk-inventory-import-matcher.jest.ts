import { describe, expect, it } from "@jest/globals";
import {
  BulkInventoryImportMatcher,
  matchFile,
  parseFilename,
  parseManifestCsv,
  pickLatestExports,
} from "@/backend/BulkInventoryImportMatcher";
import { BulkInventoryImportMatchError } from "@/util/enums";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";

const iqq = { cityId: "city-iqq", name: "Iquique", locode: "CL IQQ" };
const concón = { cityId: "city-concon", name: "Concón", locode: "CL13101" };
const ineCity = {
  cityId: "city-ine",
  name: "Santiago",
  locode: "CL13112",
};
const cities = [iqq, concón, ineCity];

describe("parseFilename", () => {
  it("parses CRFFormat city name, year, and export date", () => {
    expect(
      parseFilename("Abadia de Goiás_CRFFormat_2023_20260917.xlsx"),
    ).toEqual({
      cityName: "Abadia de Goiás",
      year: 2023,
      exportDate: "20260917",
    });
  });

  it("parses UN/LOCODE filenames", () => {
    expect(parseFilename("CL-IQQ-2023.xlsx")).toEqual({
      locode: "CL IQQ",
      year: 2023,
    });
  });

  it("parses INE code filenames", () => {
    expect(parseFilename("CL13112_2023.csv")).toEqual({
      cityName: "La Pintana",
      ineCode: "CL13112",
      locode: "CL13112",
      year: 2023,
    });
  });

  it("parses Chile MEED inventory filenames by INE, not the zip city name", () => {
    expect(
      parseFilename("inventory-CHL-13112-Penalolen-2022.csv"),
    ).toEqual({
      cityName: "La Pintana",
      ineCode: "CL13112",
      locode: "CL13112",
      year: 2022,
    });
  });

  it("prefers MEED UN/LOCODE when the comuna has one", () => {
    expect(parseFilename("inventory-CHL-13101-Santiago-2022.csv")).toEqual({
      cityName: "Santiago",
      ineCode: "CL13101",
      locode: "CL SCL",
      year: 2022,
    });
  });
});

describe("BulkInventoryImportMatcher", () => {
  it("matches a locode filename to an existing city", () => {
    const result = matchFile(
      { originalFileName: "folder/CL-IQQ-2023.xlsx" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBeUndefined();
    expect(result.cityId).toBe(iqq.cityId);
    expect(result.locode).toBe("CL IQQ");
    expect(result.year).toBe(2023);
  });

  it("matches an INE filename to locode stored on the city", () => {
    const result = matchFile(
      { originalFileName: "CL13112_2023.xlsx" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBeUndefined();
    expect(result.cityId).toBe(ineCity.cityId);
    expect(result.year).toBe(2023);
  });

  it("matches a Chile MEED file to a city stored under UN/LOCODE", () => {
    const santiago = {
      cityId: "city-scl",
      name: "Santiago",
      locode: "CL SCL",
    };
    const result = matchFile(
      { originalFileName: "inventory-CHL-13101-Anything-2022.csv" },
      { cities: [...cities, santiago], jobDefaultYear: 2022 },
    );
    expect(result.error).toBeUndefined();
    expect(result.cityId).toBe(santiago.cityId);
    expect(result.locode).toBe("CL SCL");
    expect(result.parsed.ineCode).toBe("CL13101");
  });

  it("matches accented CRFFormat names via NFKD", () => {
    const result = matchFile(
      { originalFileName: "Concón_CRFFormat_2023_20260917.xlsx" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.cityId).toBe(concón.cityId);
    expect(result.error).toBeUndefined();
  });

  it("lets the manifest override filename city and locode", () => {
    const manifest = [
      "filename,locode,ine_code,city_name,year",
      "Unknown_CRFFormat_2023_20260917.xlsx,CL IQQ,,Iquique,2023",
    ].join("\n");
    const result = matchFile(
      { originalFileName: "Unknown_CRFFormat_2023_20260917.xlsx" },
      { cities, jobDefaultYear: 2023, manifestCsv: manifest },
    );
    expect(result.error).toBeUndefined();
    expect(result.cityId).toBe(iqq.cityId);
    expect(result.locode).toBe("CL IQQ");
  });

  it("returns unmatched_city for an unknown name", () => {
    const result = matchFile(
      { originalFileName: "Nowhere_CRFFormat_2023_20260917.xlsx" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBe(BulkInventoryImportMatchError.UNMATCHED_CITY);
    expect(result.cityId).toBeNull();
    expect(result.year).toBe(2023);
  });

  it("returns unsupported_extension for pdf", () => {
    const result = matchFile(
      { originalFileName: "CL-IQQ-2023.pdf" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBe(
      BulkInventoryImportMatchError.UNSUPPORTED_EXTENSION,
    );
  });

  it("returns file_too_large above the inventory import cap", () => {
    const result = matchFile(
      {
        originalFileName: "CL-IQQ-2023.xlsx",
        fileSizeBytes: INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES + 1,
      },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBe(BulkInventoryImportMatchError.FILE_TOO_LARGE);
  });

  it("warns when the file year differs from the job year and keeps the file year", () => {
    const result = matchFile(
      { originalFileName: "CL-IQQ-2022.xlsx" },
      { cities, jobDefaultYear: 2023 },
    );
    expect(result.error).toBeUndefined();
    expect(result.year).toBe(2022);
    expect(result.warnings).toEqual(["year_mismatch"]);
  });

  it("returns missing_year when neither file nor job has a year", () => {
    const result = matchFile({ originalFileName: "mystery.xlsx" }, { cities });
    expect(result.error).toBe(BulkInventoryImportMatchError.MISSING_YEAR);
  });

  it("returns ambiguous_city when two cities share a normalized name", () => {
    const result = matchFile(
      { originalFileName: "Concón_CRFFormat_2023_20260917.xlsx" },
      {
        cities: [
          concón,
          { cityId: "city-concon-2", name: "Concon", locode: "CL99999" },
        ],
        jobDefaultYear: 2023,
      },
    );
    expect(result.error).toBe(BulkInventoryImportMatchError.AMBIGUOUS_CITY);
  });

  it("keeps the latest CRFFormat export for the same city and year", () => {
    const results = BulkInventoryImportMatcher.matchFiles(
      [
        { originalFileName: "Concón_CRFFormat_2023_20260909.xlsx" },
        { originalFileName: "Concón_CRFFormat_2023_20260917.xlsx" },
      ],
      { cities, jobDefaultYear: 2023 },
    );
    const latest = pickLatestExports(results);
    expect(latest).toHaveLength(1);
    expect(latest[0].originalFileName).toBe(
      "Concón_CRFFormat_2023_20260917.xlsx",
    );
  });

  it("indexes manifest rows by filename including quoted names", () => {
    const csv = `filename,locode,ine_code,city_name,year\n"Abadia de Goiás_CRFFormat_2023_20260917.xlsx",BR GOI,,Abadia de Goiás,2023\n`;
    const map = parseManifestCsv(csv);
    expect(
      map.get("abadia de goias_crfformat_2023_20260917.xlsx")?.locode,
    ).toBe("BR GOI");
  });

  it("stores UN/LOCODE with a space and keeps INE compact", () => {
    expect(BulkInventoryImportMatcher.formatStoredLocode("cl-iqq")).toBe(
      "CL IQQ",
    );
    expect(BulkInventoryImportMatcher.formatStoredLocode("CL13112")).toBe(
      "CL13112",
    );
  });
});
