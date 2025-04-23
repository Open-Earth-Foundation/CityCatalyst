export interface CoBenefits {
  air_quality: number;
  water_quality: number;
  habitat: number;
  cost_of_living: number;
  housing: number;
  mobility: number;
  stakeholder_engagement: number;
}

export interface GHGReductionPotential {
  stationary_energy: string | null;
  transportation: string | null;
  waste: string | null;
  ippu: string | null;
  afolu: string | null;
}

export interface BaseAction {
  locode: string;
  cityName: string;
  region: string;
  regionName: string;
  actionId: string;
  actionName: string;
  actionPriority: number;
  explanation?: string;
  action: {
    ActionID: string;
    ActionName: string;
    ActionType: string[];
    Description: string;
    CoBenefits: CoBenefits;
    CostInvestmentNeeded: string;
    TimelineForImplementation: string;
    Dependencies: string[];
    KeyPerformanceIndicators: string[];
    PowersAndMandates: string[];
    biome: string;
  };
}

export interface MitigationAction extends BaseAction {
  action: BaseAction["action"] & {
    Hazard: null;
    Sector: string[];
    Subsector: string[];
    PrimaryPurpose: string[];
    GHGReductionPotential: GHGReductionPotential;
    AdaptationEffectiveness: null;
    AdaptationEffectivenessPerHazard: null;
  };
}

export interface AdaptationAction extends BaseAction {
  action: BaseAction["action"] & {
    Hazard: string[];
    Sector: null;
    Subsector: null;
    PrimaryPurpose: string[];
    GHGReductionPotential: null;
    AdaptationEffectiveness: string;
    AdaptationEffectivenessPerHazard: Record<string, string>;
  };
}

export type Action = MitigationAction | AdaptationAction;
