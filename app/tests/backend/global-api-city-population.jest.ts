import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { fetchGlobalApiCityPopulation } from "@/backend/global-api-city-population";
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";

describe("fetchGlobalApiCityPopulation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the population series year closest to the inventory year", async () => {
    jest.spyOn(MeedGlobalApiService, "fetchPopulationHistory").mockResolvedValue({
      population: [
        { year: 2017, population: 100 },
        { year: 2022, population: 189335 },
      ],
    } as never);

    const result = await fetchGlobalApiCityPopulation(["CL13112"], 2022);
    expect(result).toEqual({ year: 2022, population: 189335 });
  });

  it("falls back to city_attributes populationSize when history is empty", async () => {
    jest
      .spyOn(MeedGlobalApiService, "fetchPopulationHistory")
      .mockResolvedValue({ population: [] } as never);
    jest.spyOn(MeedGlobalApiService, "fetchCityAttributes").mockResolvedValue({
      city: { populationSize: 177335 },
    } as never);

    const result = await fetchGlobalApiCityPopulation(["CL13112"], 2022);
    expect(result).toEqual({ year: 2022, population: 177335 });
  });
});
