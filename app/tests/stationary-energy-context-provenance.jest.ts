import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import DataSourceService, {
  downscaledByCountryPopulation,
} from "@/backend/DataSourceService";
import { buildStationaryEnergyContext } from "@/backend/agentic/ghgi/stationary-energy/context";
import {
  sourceLabel,
  sourceMetaLabel,
} from "@/components/StationaryEnergyDraft/utils";
import type { SourceCandidate } from "@/components/StationaryEnergyDraft/types";
import inventoryStructure from "@/data/inventory-structure.json";
import { db } from "@/models";
import type { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import type { Inventory } from "@/models/Inventory";

/**
 * Regression for CC-962: candidate provenance must describe the record actually
 * fetched for the inventory (city/year in the request), not the catalogue
 * coverage (startYear=2015, geographicalLocation=BR). Only `fetch`, catalogue
 * lookups and DB reads are mocked; filterSources, getSourceWithData and
 * retrieveGlobalAPISource run for real.
 */

const stationary = (
  inventoryStructure as Array<{
    sectorId: string;
    sectorName: string;
    subSectors: Array<{
      subsectorId: string;
      referenceNumber: string;
      subCategories: Array<{ subcategoryId: string; referenceNumber: string }>;
    }>;
  }>
).find((sector) => sector.sectorName === "stationary-energy")!;

function subCategoryRef(referenceNumber: string) {
  for (const subSector of stationary.subSectors) {
    const subCategory = subSector.subCategories.find(
      (row) => row.referenceNumber === referenceNumber,
    );
    if (subCategory) {
      return {
        subcategoryId: subCategory.subcategoryId,
        subCategory: {
          ...subCategory,
          subsector: {
            sectorId: stationary.sectorId,
            subsectorId: subSector.subsectorId,
            referenceNumber: subSector.referenceNumber,
          },
        },
      };
    }
  }
  throw new Error(`Unknown GPC reference ${referenceNumber}`);
}

const SEEG_ENDPOINT =
  "https://ccglobal.openearth.dev/api/v1/source/SEEG/city/:locode/:year/:gpcReferenceNumber";

// Frozen shape of the real SEEG BR SAO 2022 I.1.1 response (CC-962 evidence).
const SEEG_I_1_1_RESPONSE = {
  totals: {
    emissions: {
      co2_mass: "1111223686",
      co2_co2eq: "1111223686.00000000",
      ch4_mass: "19335",
      ch4_co2eq_100yr: "541380.00000000",
      ch4_co2eq_20yr: "0",
      n2o_mass: "21659",
      n2o_co2eq_100yr: "5739635.00000000",
      n2o_co2eq_20yr: "0",
      co2eq_100yr: "1117504701",
      co2eq_20yr: "0",
      gpc_quality: "medium",
    },
  },
  records: [
    {
      activity_name: "total-fuel-consumption",
      gases: [{ gas_name: "CO2", emissions_value: 1111223686 }],
    },
  ],
};

function source(
  id: string,
  ref: string,
  overrides: Partial<DataSource>,
): DataSource {
  return {
    datasourceId: id,
    datasourceName: id,
    retrievalMethod: "global_api",
    apiEndpoint: SEEG_ENDPOINT,
    geographicalLocation: "BR",
    startYear: 2015,
    endYear: 2022,
    ...subCategoryRef(ref),
    ...overrides,
  } as unknown as DataSource;
}

const inventory = {
  inventoryId: "inventory-sao-paulo-2022",
  year: 2022,
  inventoryType: "gpc_basic",
  globalWarmingPotentialType: "ar6",
  totalEmissions: null,
  city: {
    cityId: "city-sao-paulo",
    name: "São Paulo",
    locode: "BR SAO",
    country: "Brazil",
    region: "BR SP",
    area: null,
  },
} as unknown as Inventory;

const sources = [
  source("seeg-municipal", "I.1.1", {}),
  source("country-downscaled", "I.2.1", {
    retrievalMethod: downscaledByCountryPopulation,
    apiEndpoint:
      "https://example.test/country/:country/:year/:gpcReferenceNumber",
  }),
  source("global-static", "I.3.1", {
    apiEndpoint: "https://example.test/global/:gpcReferenceNumber",
    geographicalLocation: "EARTH",
    startYear: 2018,
    endYear: null as unknown as number,
  }),
  source("municipal-no-data", "I.4.1", {}),
  source("catalogue-out-of-range", "I.5.1", { endYear: 2020 }),
  source("catalogue-missing-years", "I.6.1", {
    startYear: undefined,
    endYear: undefined,
  }),
];

describe("Stationary Energy source candidate provenance", () => {
  let fetchedUrls: string[];

  beforeEach(() => {
    fetchedUrls = [];
    jest
      .spyOn(db.models.InventoryValue, "findAll")
      .mockResolvedValue([] as never);
    jest.spyOn(db.models.Population, "findAll").mockResolvedValue([] as never);
    jest
      .spyOn(DataSourceService, "findAllSources")
      .mockResolvedValue(sources as never);
    jest
      .spyOn(DataSourceService, "findPopulationScaleFactors")
      .mockResolvedValue({
        countryPopulationScaleFactor: 0.05,
        regionPopulationScaleFactor: 0.2,
        populationIssue: null,
      });
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      const body = url.includes("/I.4.1")
        ? { detail: "No data available" }
        : SEEG_I_1_1_RESPONSE;
      return { json: async () => body } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function candidates() {
    const context = await buildStationaryEnergyContext({ inventory });
    return Object.fromEntries(
      context.source_candidates.map((candidate) => [
        candidate.datasource_id as string,
        candidate,
      ]),
    );
  }

  it("labels a municipal record fetched for the inventory year as city/2022, not catalogue 2015/country", async () => {
    const { "seeg-municipal": seeg } = await candidates();

    expect(fetchedUrls).toContain(
      "https://ccglobal.openearth.dev/api/v1/source/SEEG/city/BR SAO/2022/I.1.1",
    );
    expect(seeg).toMatchObject({
      applicability_status: "applicable",
      dataset_year: 2022,
      geography_match: "city",
      quality_score: "1",
      confidence_notes: "City-level source matches the inventory year.",
    });
    // Emissions value and category are untouched by the provenance fix.
    expect(seeg.source_data).toMatchObject({
      totals: { emissions: { co2eq_100yr: "1117504701" } },
      scaleFactor: 1,
    });
    expect(seeg.source_scope).toMatchObject({
      subcategory_reference_number: "I.1.1",
    });

    // UI labels read the same candidate metadata (UC01 option meta / UC02 source).
    const uiCandidate = seeg as unknown as SourceCandidate;
    expect(sourceMetaLabel(uiCandidate)).toBe("2022 · city");
    expect(sourceLabel(uiCandidate)).toBe("seeg-municipal / 2022 / city");
  });

  it("keeps population-downscaled country records country-level", async () => {
    const { "country-downscaled": downscaled } = await candidates();

    expect(fetchedUrls).toContain("https://example.test/country/BR/2022/I.2.1");
    expect(downscaled).toMatchObject({
      applicability_status: "applicable",
      dataset_year: 2022,
      geography_match: "country",
      confidence_notes:
        "Country-level source (scaled to the city by population) matches the inventory year.",
    });
    expect(downscaled.source_data).toMatchObject({ scaleFactor: 0.05 });
  });

  it("does not invent a record year when the request has no year", async () => {
    const { "global-static": global } = await candidates();

    expect(global).toMatchObject({
      applicability_status: "applicable",
      dataset_year: null,
      geography_match: "global",
      quality_score: null,
      confidence_notes: "Applicable source candidate returned by CityCatalyst.",
    });
  });

  it("reports no record year for failed retrievals and removed sources", async () => {
    const all = await candidates();

    expect(all["municipal-no-data"]).toMatchObject({
      applicability_status: "failed",
      dataset_year: null,
      quality_score: null,
      confidence_notes: "Source doesn't have data available for this input",
    });
    expect(all["catalogue-out-of-range"]).toMatchObject({
      applicability_status: "removed",
      dataset_year: null,
      geography_match: "country",
      quality_score: null,
    });
    expect(all["catalogue-missing-years"]).toMatchObject({
      applicability_status: "removed",
      dataset_year: null,
      confidence_notes: "startYear or endYear missing in source",
    });
  });
});
