/**
 * Chile MEED comuna catalog for bulk inventory import.
 * Files are keyed by INE/CUT (`CL13112`); UN/LOCODE is optional enrichment.
 */
import {
  CHILE_MEED_CITIES,
  type ChileMeedCity,
} from "@/data/chile-meed-cities";

export type { ChileMeedCity };

function compactKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[-_\s]+/g, "")
    .trim();
}

function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const byIne = new Map<string, ChileMeedCity>();
const byName = new Map<string, ChileMeedCity[]>();

for (const city of CHILE_MEED_CITIES) {
  byIne.set(compactKey(city.ineCode), city);
  const key = nameKey(city.name);
  const existing = byName.get(key);
  if (existing) existing.push(city);
  else byName.set(key, [city]);
}

/** CHL (ISO 3166-1 alpha-3) in Chile MEED filenames maps to CL. */
export function iso2FromInventoryCountry(token: string): string {
  const upper = token.trim().toUpperCase();
  if (upper === "CHL") return "CL";
  if (upper.length >= 2) return upper.slice(0, 2);
  return upper;
}

/** `13112` / `CL-13112` / `CL13112` → `CL13112`. */
export function formatIneCode(
  raw: string,
  countryIso2 = "CL",
): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}\d{4,6}$/.test(compact)) return compact;
  if (/^\d{4,6}$/.test(compact)) {
    return `${countryIso2}${compact.padStart(5, "0")}`;
  }
  return null;
}

export function lookupChileMeedCityByIne(
  ineCode: string,
): ChileMeedCity | undefined {
  return byIne.get(compactKey(ineCode));
}

export function lookupChileMeedCityByName(
  name: string,
): ChileMeedCity | undefined {
  const matches = byName.get(nameKey(name));
  return matches?.length === 1 ? matches[0] : undefined;
}
