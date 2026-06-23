/**
 * City-scoped GHGI URL helpers and legacy inventory route mapping.
 */

/** Build a city-scoped GHGI inventory path. */
export function getGhgiInventoryPath(
  lng: string,
  cityId: string,
  inventoryId: string,
  suffix = "",
): string {
  const normalizedSuffix = suffix
    ? suffix.startsWith("/")
      ? suffix
      : `/${suffix}`
    : "";
  return `/${lng}/cities/${cityId}/GHGI/${inventoryId}${normalizedSuffix}`;
}

/** Map legacy inventory subpaths to their city GHGI equivalents. */
export function mapLegacyInventoryPathSuffix(suffix: string): string {
  if (
    suffix === "/data/manage-sectors" ||
    suffix.startsWith("/data/manage-sectors/")
  ) {
    return suffix.replace("/data/manage-sectors", "/manage-sectors");
  }
  return suffix;
}

/**
 * Resolve a legacy `/{lng}/{inventoryId}/...` pathname to the city GHGI route.
 */
export function resolveLegacyInventoryRedirectPath(
  lng: string,
  cityId: string,
  inventoryId: string,
  pathname: string,
): string {
  const legacyRoot = `/${lng}/${inventoryId}`;
  let suffix = "";

  if (pathname === legacyRoot || pathname === `${legacyRoot}/`) {
    suffix = "";
  } else if (pathname.startsWith(`${legacyRoot}/`)) {
    suffix = pathname.slice(legacyRoot.length);
  } else {
    const match = pathname.match(new RegExp(`/${inventoryId}(/.*)?$`));
    suffix = match?.[1] ?? "";
  }

  return getGhgiInventoryPath(
    lng,
    cityId,
    inventoryId,
    mapLegacyInventoryPathSuffix(suffix),
  );
}
