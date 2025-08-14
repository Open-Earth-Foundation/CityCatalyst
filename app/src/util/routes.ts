import { hasFeatureFlag } from "./feature-flags";
import { FeatureFlags } from "./feature-flags";

export const getDashboardPath = (lng: string, cityId?: string | string[] | null, inventoryId?: string | string[] | null) => {
  const firstCityId = Array.isArray(cityId) ? cityId[0] : cityId;
  const firstInventoryId = Array.isArray(inventoryId) ? inventoryId[0] : inventoryId;
  
  return hasFeatureFlag(FeatureFlags.JN_ENABLED)
    ? `/${lng}/${firstCityId ?? ""}`
    : `/${lng}/${firstInventoryId ?? ""}`;
};