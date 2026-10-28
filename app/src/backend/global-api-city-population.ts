/**
 * Best-effort city population from Global API for INE-only Chile comunas.
 * OpenClimate has no actor for `CL13112`.
 */
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";
import { findClosestYear, type PopulationEntry } from "@/util/helpers";
import { logger } from "@/services/logger";

const CENSUS_YEAR_WINDOW = 10;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function populationEntriesFromHistory(payload: unknown): PopulationEntry[] {
  const root = asRecord(payload);
  const rows = root?.population;
  if (!Array.isArray(rows)) return [];
  const entries: PopulationEntry[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec) continue;
    const year = asNumber(rec.year);
    const population = asNumber(rec.population);
    if (year == null || population == null) continue;
    entries.push({ year, population });
  }
  return entries;
}

function populationSizeFromAttributes(payload: unknown): number | null {
  const root = asRecord(payload);
  const city = asRecord(root?.city) ?? root;
  if (!city) return null;
  return (
    asNumber(city.populationSize) ??
    asNumber(city.population_size) ??
    asNumber(asRecord(city.population)?.attribute_value)
  );
}

export async function fetchGlobalApiCityPopulation(
  actorIds: string[],
  inventoryYear: number,
): Promise<{ population: number; year: number } | null> {
  const seen = new Set<string>();
  for (const actorId of actorIds) {
    if (!actorId || seen.has(actorId)) continue;
    seen.add(actorId);
    try {
      const history = await MeedGlobalApiService.fetchPopulationHistory(actorId);
      const closest = findClosestYear(
        populationEntriesFromHistory(history),
        inventoryYear,
        CENSUS_YEAR_WINDOW,
      );
      if (closest) return closest;

      const attributes =
        await MeedGlobalApiService.fetchCityAttributes(actorId);
      const size = populationSizeFromAttributes(attributes);
      if (size != null) {
        return { population: size, year: inventoryYear };
      }
    } catch (err) {
      logger.warn(
        { err, actorId, inventoryYear },
        "Global API population lookup failed (best-effort)",
      );
    }
  }
  return null;
}
