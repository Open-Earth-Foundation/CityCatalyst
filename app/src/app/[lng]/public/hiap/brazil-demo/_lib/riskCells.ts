/**
 * The six AdaptaBrasil sectors and twelve risk cells with municipal data —
 * methodology §1.3, locked decision #4. Labels follow AdaptaBrasil's own
 * Portuguese names.
 */
import type {
  AdaptaSector,
  RiskCell,
  RiskCellKey,
  UncoveredHazard,
  Localized,
} from "./types";
import { localized } from "./localized";

export const ADAPTA_SECTORS: AdaptaSector[] = [
  "water_resources",
  "food_security",
  "energy_security",
  "geohydrological_disasters",
  "health",
  "biodiversity",
];

export const SECTOR_LABEL: Record<AdaptaSector, Localized> = {
  water_resources: localized("Water resources", "Recursos hídricos"),
  food_security: localized("Food security", "Segurança alimentar"),
  energy_security: localized("Energy security", "Segurança energética"),
  geohydrological_disasters: localized(
    "Geohydrological disasters",
    "Desastres geo-hidrológicos",
  ),
  health: localized("Health", "Saúde"),
  biodiversity: localized("Biodiversity", "Biodiversidade"),
};

/**
 * One colour per sector. Kept away from the GPC palette so a reviewer who
 * knows the mitigation screens does not read blue as "stationary energy".
 */
export const SECTOR_HEX: Record<AdaptaSector, string> = {
  water_resources: "#2F80ED",
  food_security: "#E67E22",
  energy_security: "#D4A017",
  geohydrological_disasters: "#7B61FF",
  health: "#EB5757",
  biodiversity: "#27AE60",
};

export const RISK_CELLS: RiskCell[] = [
  {
    key: "water_stress",
    sector: "water_resources",
    label: localized("Water stress", "Estresse hídrico"),
    hazardLabel: localized(
      "Water scarcity (SPEI, drought)",
      "Escassez hídrica (SPEI, seca)",
    ),
    hasComponents: true,
  },
  {
    key: "food_availability",
    sector: "food_security",
    label: localized("Food availability", "Disponibilidade de alimentos"),
    hazardLabel: localized(
      "Drought (consecutive dry days)",
      "Seca (dias secos consecutivos)",
    ),
    hasComponents: true,
  },
  {
    key: "food_access",
    sector: "food_security",
    label: localized(
      "Food access and consumption",
      "Acesso e consumo de alimentos",
    ),
    hazardLabel: localized(
      "Composite climate hazard",
      "Ameaça climática composta",
    ),
    hasComponents: true,
  },
  {
    key: "energy_access",
    sector: "energy_security",
    label: localized("Energy access", "Acesso à energia"),
    hazardLabel: localized(
      "Hydropower, solar, wind potential; cooling demand",
      "Potencial hídrico, solar e eólico; demanda de refrigeração",
    ),
    hasComponents: true,
  },
  {
    key: "energy_availability",
    sector: "energy_security",
    label: localized("Energy availability", "Disponibilidade de energia"),
    hazardLabel: localized(
      "Climate-driven resource potentials",
      "Potenciais de recursos condicionados pelo clima",
    ),
    hasComponents: false,
  },
  {
    key: "floods",
    sector: "geohydrological_disasters",
    label: localized(
      "Floods, flash floods and urban flooding",
      "Inundações, enxurradas e alagamentos",
    ),
    hazardLabel: localized(
      "Rainfall-driven flood hazard",
      "Ameaça de inundação por chuvas",
    ),
    hasComponents: true,
  },
  {
    key: "landslide",
    sector: "geohydrological_disasters",
    label: localized("Landslides", "Deslizamentos de terra"),
    hazardLabel: localized(
      "Rainfall-driven landslide hazard",
      "Ameaça de deslizamento por chuvas",
    ),
    hasComponents: true,
  },
  {
    key: "malaria",
    sector: "health",
    label: localized("Malaria", "Malária"),
    hazardLabel: localized(
      "Max temperature, precipitation, humidity",
      "Temperatura máxima, precipitação, umidade",
    ),
    hasComponents: true,
  },
  {
    key: "arboviruses",
    sector: "health",
    label: localized(
      "Arboviruses (dengue, zika, chikungunya)",
      "Arboviroses (dengue, zika, chikungunya)",
    ),
    hazardLabel: localized(
      "Temperature, heat waves, precipitation",
      "Temperatura, ondas de calor, precipitação",
    ),
    hasComponents: true,
  },
  {
    key: "cutaneous_leishmaniasis",
    sector: "health",
    label: localized("Cutaneous leishmaniasis", "Leishmaniose tegumentar"),
    hazardLabel: localized(
      "Max temperature, precipitation",
      "Temperatura máxima, precipitação",
    ),
    hasComponents: true,
  },
  {
    key: "visceral_leishmaniasis",
    sector: "health",
    label: localized("Visceral leishmaniasis", "Leishmaniose visceral"),
    hazardLabel: localized(
      "Min temperature, precipitation",
      "Temperatura mínima, precipitação",
    ),
    hasComponents: true,
  },
  {
    key: "biome_integrity",
    sector: "biodiversity",
    label: localized("Biome integrity", "Integridade dos biomas"),
    hazardLabel: localized(
      "Annual temperature, precipitation seasonality",
      "Temperatura anual, sazonalidade da precipitação",
    ),
    hasComponents: true,
  },
];

export const RISK_CELL_BY_KEY: Record<RiskCellKey, RiskCell> =
  Object.fromEntries(RISK_CELLS.map((cell) => [cell.key, cell])) as Record<
    RiskCellKey,
    RiskCell
  >;

export const UNCOVERED_HAZARD_LABEL: Record<UncoveredHazard, Localized> = {
  sea_level_rise: localized("Sea-level rise", "Elevação do nível do mar"),
  extreme_heat: localized(
    "Extreme heat as a standalone hazard",
    "Calor extremo como ameaça isolada",
  ),
};

export function cellsOf(sector: AdaptaSector): RiskCell[] {
  return RISK_CELLS.filter((cell) => cell.sector === sector);
}
