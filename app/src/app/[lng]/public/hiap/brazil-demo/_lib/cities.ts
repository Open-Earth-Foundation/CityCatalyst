/**
 * The five cities of the methodology's illustrative ranking table (§4.8).
 *
 * From the methodology document: Sobral's water-stress reading
 * (H 0.72 / V 0.63 / E 1.00, §4.7) and Itaubal's zero malaria vulnerability
 * (§4.8, second dynamic). Every other number is illustrative — chosen so the
 * five profiles differ in the ways the document says they do, not read from
 * AdaptaBrasil. CAPAG grades, MUNIC scores and the socioeconomic context are
 * likewise placeholders in the right ranges.
 */
import type { CityFixture, RiskReading } from "./types";

const r = (
  hazard: number,
  exposure: number,
  vulnerability: number,
  index: number,
  drift = 0.06,
): RiskReading => ({
  hazard,
  exposure,
  vulnerability,
  index,
  index2030: Math.min(1, +(index + drift).toFixed(2)),
  index2050: Math.min(1, +(index + drift * 2.2).toFixed(2)),
});

export const CITIES: CityFixture[] = [
  {
    slug: "caxias-do-sul",
    name: "Caxias do Sul",
    state: "RS",
    locode: "BR CXJ",
    population: 517451,
    coastal: false,
    risk: {
      water_stress: r(0.55, 0.62, 0.48, 0.52),
      food_availability: r(0.32, 0.4, 0.35, 0.3),
      food_access: r(0.28, 0.45, 0.3, 0.27),
      energy_access: r(0.4, 0.5, 0.3, 0.35),
      energy_availability: r(0.4, 0, 0, 0.38),
      floods: r(0.82, 0.7, 0.58, 0.74, 0.08),
      landslide: r(0.66, 0.55, 0.5, 0.6),
      malaria: r(0, 0.3, 0.2, 0),
      arboviruses: r(0.35, 0.6, 0.4, 0.33),
      cutaneous_leishmaniasis: r(0.1, 0.2, 0.3, 0.1),
      visceral_leishmaniasis: r(0.08, 0.2, 0.3, 0.09),
      biome_integrity: r(0.45, 0.5, 0.55, 0.48),
    },
    capag: "B",
    financePush: 11,
    context: {
      povertyRate: 5.8,
      informalSettlementShare: 3.1,
      urbanShare: 96.3,
      gdpPerCapitaBrl: 58900,
      hdi: 0.782,
    },
    inventory: {
      year: 2023,
      bySector: {
        "stationary-energy": 812000,
        transportation: 640000,
        waste: 158000,
        ippu: 296000,
        afolu: 74000,
      },
    },
  },
  {
    slug: "sobral",
    name: "Sobral",
    state: "CE",
    locode: "BR SBL",
    population: 210711,
    coastal: false,
    risk: {
      // Methodology §4.7 worked example.
      water_stress: r(0.72, 1.0, 0.63, 0.78, 0.07),
      food_availability: r(0.8, 0.7, 0.7, 0.74, 0.08),
      food_access: r(0.6, 0.65, 0.62, 0.6),
      energy_access: r(0.45, 0.5, 0.5, 0.45),
      energy_availability: r(0.5, 0, 0, 0.44),
      floods: r(0.3, 0.45, 0.5, 0.32),
      landslide: r(0.1, 0.2, 0.4, 0.12),
      malaria: r(0.15, 0.3, 0.45, 0.16),
      arboviruses: r(0.62, 0.7, 0.6, 0.6),
      cutaneous_leishmaniasis: r(0.5, 0.45, 0.55, 0.48),
      visceral_leishmaniasis: r(0.58, 0.5, 0.6, 0.55),
      biome_integrity: r(0.55, 0.4, 0.5, 0.5),
    },
    capag: "C",
    financePush: 8,
    context: {
      povertyRate: 27.4,
      informalSettlementShare: 9.6,
      urbanShare: 88.4,
      gdpPerCapitaBrl: 26100,
      hdi: 0.714,
    },
    inventory: {
      year: 2023,
      bySector: {
        "stationary-energy": 210000,
        transportation: 240000,
        waste: 92000,
        ippu: 61000,
        afolu: 118000,
      },
    },
  },
  {
    slug: "santa-cruz",
    name: "Santa Cruz",
    state: "RN",
    locode: "BR SCZ",
    population: 41049,
    coastal: false,
    risk: {
      water_stress: r(0.68, 0.7, 0.66, 0.7, 0.07),
      food_availability: r(0.85, 0.75, 0.72, 0.8, 0.08),
      food_access: r(0.7, 0.68, 0.7, 0.68),
      energy_access: r(0.5, 0.45, 0.55, 0.48),
      energy_availability: r(0.5, 0, 0, 0.46),
      floods: r(0.2, 0.35, 0.5, 0.22),
      landslide: r(0.08, 0.15, 0.4, 0.09),
      malaria: r(0.05, 0.2, 0.5, 0.06),
      arboviruses: r(0.55, 0.6, 0.65, 0.56),
      cutaneous_leishmaniasis: r(0.4, 0.4, 0.6, 0.42),
      visceral_leishmaniasis: r(0.52, 0.45, 0.62, 0.5),
      biome_integrity: r(0.6, 0.35, 0.55, 0.52),
    },
    capag: "nd",
    financePush: 4,
    context: {
      povertyRate: 38.1,
      informalSettlementShare: 12.2,
      urbanShare: 74.5,
      gdpPerCapitaBrl: 15400,
      hdi: 0.635,
    },
    inventory: {
      year: 2023,
      bySector: {
        "stationary-energy": 31000,
        transportation: 44000,
        waste: 12000,
        ippu: 3000,
        afolu: 67000,
      },
    },
  },
  {
    slug: "sao-luis",
    name: "São Luís",
    state: "MA",
    locode: "BR SLZ",
    population: 1037775,
    coastal: true,
    risk: {
      water_stress: r(0.5, 0.75, 0.6, 0.55),
      food_availability: r(0.55, 0.6, 0.66, 0.56),
      food_access: r(0.62, 0.72, 0.7, 0.64),
      energy_access: r(0.48, 0.6, 0.55, 0.5),
      energy_availability: r(0.45, 0, 0, 0.42),
      floods: r(0.72, 0.8, 0.7, 0.74, 0.08),
      landslide: r(0.3, 0.4, 0.5, 0.31),
      malaria: r(0.5, 0.55, 0.6, 0.5),
      arboviruses: r(0.7, 0.8, 0.65, 0.7, 0.07),
      cutaneous_leishmaniasis: r(0.6, 0.5, 0.6, 0.56),
      visceral_leishmaniasis: r(0.65, 0.55, 0.62, 0.6),
      biome_integrity: r(0.5, 0.6, 0.55, 0.52),
    },
    capag: "B",
    financePush: 9,
    context: {
      povertyRate: 24.9,
      informalSettlementShare: 22.7,
      urbanShare: 94.5,
      gdpPerCapitaBrl: 31900,
      hdi: 0.768,
    },
    inventory: {
      year: 2023,
      bySector: {
        "stationary-energy": 1290000,
        transportation: 1010000,
        waste: 410000,
        ippu: 1560000,
        afolu: 95000,
      },
    },
  },
  {
    slug: "itaubal",
    name: "Itaubal",
    state: "AP",
    locode: "BR ITB",
    population: 6165,
    coastal: false,
    risk: {
      water_stress: r(0.2, 0.4, 0.62, 0.22),
      food_availability: r(0.7, 0.6, 0.75, 0.68, 0.07),
      food_access: r(0.65, 0.55, 0.72, 0.62),
      energy_access: r(0.6, 0.5, 0.7, 0.58),
      energy_availability: r(0.55, 0, 0, 0.5),
      floods: r(0.6, 0.5, 0.68, 0.58),
      landslide: r(0.05, 0.1, 0.4, 0.06),
      // Methodology §4.8: municipal malaria vulnerability index is zero, so
      // the healthcare action has no scored contribution here.
      malaria: r(0.9, 0.4, 0, 0.3),
      arboviruses: r(0.55, 0.45, 0.6, 0.5),
      cutaneous_leishmaniasis: r(0.7, 0.4, 0.65, 0.6),
      visceral_leishmaniasis: r(0.3, 0.3, 0.5, 0.3),
      biome_integrity: r(0.62, 0.7, 0.6, 0.64, 0.08),
    },
    capag: "D",
    financePush: 2,
    context: {
      povertyRate: 44.6,
      informalSettlementShare: 18.3,
      urbanShare: 41.2,
      gdpPerCapitaBrl: 11800,
      hdi: 0.576,
    },
    inventory: {
      year: 2023,
      bySector: {
        "stationary-energy": 2100,
        transportation: 3900,
        waste: 900,
        ippu: 0,
        afolu: 21000,
      },
    },
  },
];

export const CITY_BY_SLUG: Record<string, CityFixture> = Object.fromEntries(
  CITIES.map((city) => [city.slug, city]),
);

export const DEFAULT_CITY = CITIES[1]; // Sobral — the methodology's worked example.
