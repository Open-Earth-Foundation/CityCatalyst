import { SectorNamesInFE } from "@/backend/ResultsService";
import { LANGUAGES } from "@/util/types";

interface MethodologyApproach {
  type: string;
  guidance: string;
}

// For emission factors, parameters, etc. (optional, not always present)
interface EmissionFactor {
  gas?: string;
  waste_type?: string;
  technology?: string;
  treatment?: string;
  waste_state?: string;
  boiler_type?: string;
  value: number;
}

export interface Equation {
  label: string;
  formula: string;
}

interface Parameter {
  code: string;
  description: string;
  units: string | string[];
}

interface MethodologyTranslation {
  methodology: string;
  overview: string;
  sector?: string;
  scope?: string | { [key: string]: string }; // sometimes an object, sometimes a string
  approach?: MethodologyApproach;
  data_requirements?: string[];
  assumptions?: string[];
  advantages?: string[];
  features?: string[];
  limitations?: string[];
  facilities?: string;
  emissions?: string;
  default_emission_factors?: EmissionFactor[];
  parameters?: Parameter[];
  equation?: Equation;
  equations?: {
    label: string;
    formula: string;
  }[];
  guidance?: string;
}

export interface MethodologyBySector {
  sector: SectorNamesInFE | "multiple";
  sector_roman_numeral?: string;
  methodologies: {
    id: string;
    translations: {
      en: MethodologyTranslation;
      es: MethodologyTranslation;
      pt: MethodologyTranslation;
      de: MethodologyTranslation;
      fr: MethodologyTranslation;
    };
  }[];
}
