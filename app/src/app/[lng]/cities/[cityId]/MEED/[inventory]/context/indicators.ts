import type { TFunction } from "i18next";
import type { MeedTone } from "../../components/MeedStatusTag";

/**
 * Socioeconomic indicator model for the MEED+ context step.
 *
 * The Global API `city_attributes` response (proxied by
 * `/api/v1/city/{city}/modules/meed/city-attributes`) returns a `city` object
 * whose indicator fields look like
 * `{ attribute_value, attribute_category, attribute_units? }`. This module
 * parses that shape and enriches it with theme grouping, sources and
 * hand-written climate-relevance copy ported from the prototype
 * (SocioeconomicContext.tsx INDICATOR_ENRICHMENT).
 */

export type IndicatorCategory =
  "very high" | "high" | "medium" | "low" | "very low";

export type IndicatorConcern = "risk" | "opportunity" | "neutral";

export interface MeedIndicator {
  key: string;
  label: string;
  value: number;
  units: string;
  category: IndicatorCategory;
  themeKey: string;
  relevance: string;
  concern: IndicatorConcern;
  source: string;
}

export interface ApiAttributeField {
  attribute_value: number;
  attribute_category: string;
  attribute_units?: string;
}

interface IndicatorMeta {
  /** i18n theme key suffix (theme-<key>) */
  themeKey: string;
  units: string;
  /** Upstream dataset name (data, not UI copy) */
  source: string;
  concern: IndicatorConcern;
  /** True when per-category relevance copy exists in meed-context.json */
  enriched?: boolean;
}

export const THEME_ORDER = [
  "income-welfare",
  "housing",
  "mobility",
  "energy",
  "employment",
  "demographics",
  "digital-infrastructure",
  "land-use",
  "other",
];

/**
 * Metadata for every indicator the prototype knew about. Indicators flagged
 * `enriched` have hand-written relevance copy per category in
 * meed-context.json; the rest fall back to generic relevance copy.
 */
const INDICATOR_META: Record<string, IndicatorMeta> = {
  poverty_rate: {
    themeKey: "income-welfare",
    units: "percent",
    source: "CASEN 2022",
    concern: "risk",
    enriched: true,
  },
  median_household_income: {
    themeKey: "income-welfare",
    units: "CLP",
    source: "CASEN 2022",
    concern: "opportunity",
    enriched: true,
  },
  unemployment_rate: {
    themeKey: "income-welfare",
    units: "percent",
    source: "INE 2022",
    concern: "risk",
    enriched: true,
  },
  renter_share: {
    themeKey: "housing",
    units: "percent",
    source: "CENSO 2017",
    concern: "risk",
    enriched: true,
  },
  home_ownership: {
    themeKey: "housing",
    units: "percent",
    source: "CENSO 2017",
    concern: "neutral",
    enriched: true,
  },
  public_transport_share: {
    themeKey: "mobility",
    units: "percent",
    source: "EOD 2021",
    concern: "opportunity",
    enriched: true,
  },
  electricity_access_rate: {
    themeKey: "energy",
    units: "percent",
    source: "INE 2022",
    concern: "opportunity",
    enriched: true,
  },
  employment_in_transport_and_logistics: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  employment_construction: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  employment_agriculture_forestry: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  employment_electricity_gas: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  employment_manufacturing: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
    enriched: true,
  },
  employment_mining: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  employment_water_waste: {
    themeKey: "employment",
    units: "percent",
    source: "INE 2022",
    concern: "neutral",
  },
  disability_prevalence: {
    themeKey: "demographics",
    units: "percent",
    source: "ENDISC 2015",
    concern: "neutral",
  },
  indigenous_identification_rate: {
    themeKey: "demographics",
    units: "percent",
    source: "CASEN 2022",
    concern: "neutral",
    enriched: true,
  },
  literacy_rate: {
    themeKey: "demographics",
    units: "percent",
    source: "CASEN 2022",
    concern: "opportunity",
    enriched: true,
  },
  mean_years_schooling: {
    themeKey: "demographics",
    units: "years",
    source: "CASEN 2022",
    concern: "opportunity",
    enriched: true,
  },
  population: {
    themeKey: "demographics",
    units: "count",
    source: "CENSO 2017",
    concern: "neutral",
    enriched: true,
  },
  fixed_internet_household_share: {
    themeKey: "digital-infrastructure",
    units: "percent",
    source: "SUBTEL 2022",
    concern: "opportunity",
    enriched: true,
  },
  primary_forest_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "opportunity",
    enriched: true,
  },
  secondary_forest_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "opportunity",
  },
  silviculture_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  cropland_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  pasture_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  grassland_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  shrubland_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  beach_dune_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  ice_snow_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "risk",
  },
  other_bare_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  urban_built_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
    enriched: true,
  },
  water_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "neutral",
  },
  wetland_share: {
    themeKey: "land-use",
    units: "percent",
    source: "ESA CCI 2020",
    concern: "opportunity",
  },
};

const VALID_CATEGORIES: IndicatorCategory[] = [
  "very high",
  "high",
  "medium",
  "low",
  "very low",
];

const kebab = (s: string) => s.replace(/[_\s]+/g, "-");

const humanize = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Pull indicator-shaped fields out of the raw (unknown) hook response.
 * Returns null when the upstream has no data for this city.
 */
export function extractIndicatorFields(
  data: unknown,
): Record<string, ApiAttributeField> | null {
  if (!data || typeof data !== "object") return null;
  const city = (data as { city?: unknown }).city;
  if (!city || typeof city !== "object") return null;

  const fields: Record<string, ApiAttributeField> = {};
  for (const [key, value] of Object.entries(city)) {
    if (
      value &&
      typeof value === "object" &&
      "attribute_value" in value &&
      "attribute_category" in value &&
      typeof (value as ApiAttributeField).attribute_value === "number"
    ) {
      fields[key] = value as ApiAttributeField;
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export function buildIndicators(
  fields: Record<string, ApiAttributeField>,
  t: TFunction,
): MeedIndicator[] {
  return Object.entries(fields).map(([key, field]) => {
    const meta = INDICATOR_META[key];
    const rawCategory = field.attribute_category as IndicatorCategory;
    const category: IndicatorCategory = VALID_CATEGORIES.includes(rawCategory)
      ? rawCategory
      : "medium";
    const keyKebab = kebab(key);
    const catKebab = kebab(category);
    const label = meta ? t(`indicator-${keyKebab}`) : humanize(key);
    const relevance = meta?.enriched
      ? t(`relevance-${keyKebab}-${catKebab}`)
      : t(`relevance-fallback-${catKebab}`, { label: label.toLowerCase() });

    return {
      key,
      label,
      value: field.attribute_value,
      units: meta?.units ?? field.attribute_units ?? "percent",
      category,
      themeKey: meta?.themeKey ?? "other",
      relevance,
      concern: meta?.concern ?? "neutral",
      source: meta?.source ?? "ccglobal API",
    };
  });
}

export function formatIndicatorValue(ind: MeedIndicator, t: TFunction): string {
  if (ind.units === "CLP")
    return t("value-clp-millions", {
      value: (ind.value / 1_000_000).toFixed(1),
    });
  if (ind.units === "years")
    return t("value-years", { value: ind.value.toFixed(1) });
  if (ind.units === "count") return ind.value.toLocaleString();
  return `${ind.value}%`;
}

export function sortThemes(themeKeys: string[]): string[] {
  return [...themeKeys].sort((a, b) => {
    const ai = THEME_ORDER.indexOf(a);
    const bi = THEME_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Key indicators surfaced as summary cards, in display order. */
export const KEY_INDICATOR_KEYS = [
  "poverty_rate",
  "unemployment_rate",
  "home_ownership",
  "public_transport_share",
];

/**
 * Relative level → status-tag tone. Chakra's `colorPalette` rendered these as
 * stock greys, so the five levels were indistinguishable; these map onto the
 * module's semantic tones instead.
 */
export const CATEGORY_TONE: Record<IndicatorCategory, MeedTone> = {
  "very high": "negative",
  high: "warning",
  medium: "info",
  low: "positive",
  "very low": "neutral",
};

export const categoryLabelKey = (category: IndicatorCategory) =>
  `category-${kebab(category)}`;
