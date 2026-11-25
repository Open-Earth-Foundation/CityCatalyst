import { getGhgiInventoryPath } from "./ghgi-routes";

/** Build the city home path used by top-level navigation. */
export const getCityHomePath = (
  lng: string,
  cityId?: string | string[] | null,
) => {
  const firstCityId = Array.isArray(cityId) ? cityId[0] : cityId;

  return `/${lng}/cities/${firstCityId ?? ""}`;
};

/** Build the module home path, preserving legacy inventory routes when needed. */
export const getHomePath = (
  lng: string,
  cityId?: string | string[] | null,
  inventoryId?: string | string[] | null,
) => {
  const firstCityId = Array.isArray(cityId) ? cityId[0] : cityId;
  const firstInventoryId = Array.isArray(inventoryId)
    ? inventoryId[0]
    : inventoryId;

  if (firstCityId && firstInventoryId) {
    return getGhgiInventoryPath(lng, firstCityId, firstInventoryId);
  }

  const cityPath = `/${lng}/cities/${firstCityId ?? ""}`;

  return cityPath;
};

/** Build the city dashboard path used by global navigation. */
export const getDashboardPath = (
  lng: string,
  cityId?: string | string[] | null,
) => {
  return getCityHomePath(lng, cityId) + "/dashboard";
};

/**
 * Build the URL for the current page in another language, keeping the
 * query string and hash (e.g. `callbackUrl` on the login page).
 */
export const getLocalizedPath = (
  pathname: string,
  language: string,
  search = "",
  hash = "",
) => {
  const localizedPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, `/${language}`);
  return `${localizedPath}${search}${hash}`;
};
