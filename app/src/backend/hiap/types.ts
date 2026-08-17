import { ACTION_TYPES } from "@/util/types";

export interface PrioritizerResponse {
  metadata: PrioritizerResponseMetadata;
  rankedActionsMitigation: PrioritizerRankedAction[];
  rankedActionsAdaptation: PrioritizerRankedAction[];
}

export interface PrioritizerResponseMetadata {
  locode: string;
  rankedDate: string;
}

export interface PrioritizerRankedAction {
  actionId: string;
  rank: number;
  explanation: {
    explanations?: Record<string, string>;
  };
}

export interface MergedRankedAction {
  actionId: string;
  rank: number;
  explanation: { explanations?: Record<string, string> };
  type: ACTION_TYPES;
  isSelected?: boolean;
  name?: string;
  hazard: string[] | null;
  sector: string[] | null;
  subsector: string[] | null;
  primaryPurpose: string[];
  description?: string;
  cobenefits: { [k: string]: number };
  equityAndInclusionConsiderations?: string;
  GHGReductionPotential: { [k: string]: string };
  adaptationEffectiveness: string | null;
  costInvestmentNeeded: string | null;
  timelineForImplementation: string | null;
  dependencies: string[];
  keyPerformanceIndicators: string[];
  powersAndMandates: string[] | null;
  adaptationEffectivenessPerHazard: { [k: string]: string };
  biome: string | null;
}

export interface CityContextData {
  locode: string;
  populationSize: number | null;
}

/**
 * City emissions data - internal representation (can have null values)
 */
export interface CityEmissionsData {
  stationaryEnergyEmissions: number | null;
  transportationEmissions: number | null;
  wasteEmissions: number | null;
  ippuEmissions: number | null;
  afoluEmissions: number | null;
}

export interface PrioritizerCityData {
  cityContextData: CityContextData;
  cityEmissionsData: CityEmissionsData;
}

export interface PrioritizerRequest {
  cityData: PrioritizerCityData;
}

export interface PrioritizerResponseBulk {
  prioritizerResponseList: PrioritizerResponse[];
}

/**
 * The action plan format used by the HIAP plan-creator API (both sent for
 * translation and received back), and stored/read via ActionPlanService's
 * transformPlanData/transformToLegacyFormat. This is a loosely-typed
 * external API payload, not the DB column shape (see models/ActionPlan.ts).
 */
export interface LegacyActionPlanData {
  metadata?: {
    cityName?: string | null;
    createdAt?: string | null;
    actionName?: string | null;
    locode?: string | null;
    actionId?: string | null;
    language?: string | null;
  };
  content?: {
    introduction?: {
      city_description?: string | null;
      action_description?: string | null;
      national_strategy_explanation?: string | null;
    };
    subactions?: object | null;
    institutions?: object | null;
    milestones?: object | null;
    timeline?: object | null;
    costBudget?: object | null;
    merIndicators?: object | null;
    mitigations?: object | null;
    adaptations?: object | null;
    sdgs?: object | null;
  };
}
