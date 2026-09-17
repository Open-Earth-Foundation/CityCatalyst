import {
  formatStoredLocode,
  normalizeCityName,
  normalizeLocode,
} from "@/backend/BulkInventoryImportMatcher";

export interface OpenClimateCitySearchHit {
  actor_id: string;
  name: string;
  type?: string;
  is_part_of?: string;
}

export type OpenClimateCityResolveResult =
  | { kind: "none" }
  | { kind: "unique"; actorId: string; name: string }
  | { kind: "ambiguous"; candidates: { actorId: string; name: string }[] };

/** ISO 3166-1 alpha-2 from a locode or form value (`BR`, `BR GOI`, `br-goi`). */
export function normalizeCountryLocode(
  value?: string | null,
): string | null {
  if (!value) return null;
  const compact = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (compact.length < 2) return null;
  return compact.slice(0, 2);
}

export function actorCountryLocode(actorId: string): string | null {
  return normalizeCountryLocode(actorId);
}

/**
 * Same rule as onboarding: keep city-type hits, then accept only an exact
 * NFKD name match. Optional country prefix (`BR`) avoids San José collisions.
 */
export function pickUniqueOpenClimateCity(
  hits: OpenClimateCitySearchHit[],
  queryName: string,
  countryLocode?: string | null,
): OpenClimateCityResolveResult {
  const country = normalizeCountryLocode(countryLocode);
  const nameKey = normalizeCityName(queryName);
  if (!nameKey) return { kind: "none" };

  const cities = hits.filter((hit) => !hit.type || hit.type === "city");
  const inCountry = country
    ? cities.filter((hit) => actorCountryLocode(hit.actor_id) === country)
    : cities;
  const exact = inCountry.filter(
    (hit) => hit.name != null && normalizeCityName(hit.name) === nameKey,
  );

  if (exact.length === 1) {
    return {
      kind: "unique",
      actorId: formatStoredLocode(exact[0].actor_id),
      name: exact[0].name,
    };
  }
  if (exact.length > 1) {
    const seen = new Set<string>();
    const candidates: { actorId: string; name: string }[] = [];
    for (const hit of exact) {
      const actorId = formatStoredLocode(hit.actor_id);
      const key = normalizeLocode(actorId);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ actorId, name: hit.name });
    }
    if (candidates.length === 1) {
      return {
        kind: "unique",
        actorId: candidates[0].actorId,
        name: candidates[0].name,
      };
    }
    return { kind: "ambiguous", candidates };
  }
  return { kind: "none" };
}
