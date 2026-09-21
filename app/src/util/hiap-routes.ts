/**
 * City-scoped HIAP URL helpers used by app navigation and notification emails.
 */

/** Build a city-scoped HIAP inventory path. */
export function getHiapInventoryPath(
  lng: string,
  cityId: string,
  inventoryId: string,
): string {
  return `/${lng}/cities/${cityId}/HIAP/${inventoryId}`;
}

/**
 * Build an absolute HIAP inventory URL for emails and other external links.
 * Strips a trailing slash from HOST so we never produce `//en/...`.
 */
export function buildHiapInventoryUrl(
  cityId: string,
  inventoryId: string,
  language: string = "en",
): string {
  const baseUrl = (process.env.HOST || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${baseUrl}${getHiapInventoryPath(language, cityId, inventoryId)}`;
}
