import { Inventory } from "@/models/Inventory";
import { DataSource } from "@/models/DataSource";
import createHttpError from "http-errors";

const EARTH_LOCATION = "EARTH";

export function filterSources(inventory: Inventory, dataSources: DataSource[]): DataSource[] {
  if (!inventory.city) {
    throw createHttpError.InternalServerError("Inventory doesn't contain city data!");
  }
  const { city } = inventory;

  return dataSources.filter((source) => {
    const locations = source.geographicalLocation?.split(",");
    if (locations?.includes(EARTH_LOCATION)) {
      return true;
    }

    const isCountry = city.country && locations?.includes(city.country);
    const isRegion = city.region && locations?.includes(city.region);
    const isCity = city.locode && locations?.includes(city.locode);

    return isCountry || isRegion || isCity;
  });
}