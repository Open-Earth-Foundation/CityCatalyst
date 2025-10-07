import { hasFeatureFlag } from "./feature-flags";
import { FeatureFlags } from "./feature-flags";

export const getHomePath = (
  lng: string,
  cityId?: string | string[] | null,
  inventoryId?: string | string[] | null,
) => {
  const firstCityId = Array.isArray(cityId) ? cityId[0] : cityId;
  const firstInventoryId = Array.isArray(inventoryId)
    ? inventoryId[0]
    : inventoryId;
  const cityPath = `/${lng}/cities/${firstCityId ?? ""}`; // Always go to cities overview when JN is enabled
  const inventoryPath = `/${lng}/${firstInventoryId ?? ""}`;

  return hasFeatureFlag(FeatureFlags.JN_ENABLED) ? cityPath : inventoryPath;
};

export const getDashboardPath = (
  lng: string,
  cityId?: string | string[] | null,
  inventoryId?: string | string[] | null,
) => {
  return getHomePath(lng, cityId, inventoryId) + "/dashboard";
};