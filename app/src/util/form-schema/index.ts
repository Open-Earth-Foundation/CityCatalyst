import SectorFormSchema from "./sector-form-schema.json";
import HIERARCHY from "./manual-input-hierarchy.json";

interface ExtraField {
  id: string;
  type?: string;
  options?: string[];
  exclusive?: string;
  multiselect?: boolean;
  required?: boolean;
  totalRequired?: number;
  subtypes?: string[];
}

export interface Activity {
  id: string;
  "unique-by"?: string[];
  "activity-title"?: string;
  minimum?: number;
  "extra-fields"?: ExtraField[];
  units?: string[];
  formula?: string;
}

export interface Methodology {
  id: string;
  disabled?: boolean;
  activities?: Activity[];
  inputRequired?: string[];
  fields?: []
  suggestedActivitiesId?: string;
  suggestedActivities?: Activity[];
}

export interface DirectMeasure {
  suggestedActivitiesId?: string;
  suggestedActivities?: Activity[];
  inputRequired?: string[];
  id?: string;
 "extra-fields"?: ExtraField[];
}

interface ManualInputHierarchy {
  [key: string]: {
    methodologies?: Methodology[];
    directMeasure?: DirectMeasure;
  };
}

const MANUAL_INPUT_HIERARCHY = HIERARCHY as ManualInputHierarchy;

export { SectorFormSchema, MANUAL_INPUT_HIERARCHY };
