import SectorFormSchema from "./sector-form-schema.json";
import HIERARCHY from "./manual-input-hierarchy.json";

export { SectorFormSchema };

export function findMethodology(
  methodologyId: string,
  refNo: string | null = null, // if null, search all reference numbers (slower)
): Methodology | undefined {
  let methodologies: Methodology[] = [];
  if (refNo) {
    methodologies =
      MANUAL_INPUT_HIERARCHY[refNo]?.methodologies ?? methodologies;
  } else {
    methodologies = Object.values(MANUAL_INPUT_HIERARCHY).flatMap(
      (hierarchy) => {
        return hierarchy.methodologies ?? [];
      },
    );
  }

  const foundMethology = methodologies.find(
    (methodology) => methodology.id === methodologyId,
  );
  return foundMethology;
}

export interface ExtraField {
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
  "group-by"?: string;
  "unique-by"?: string[];
  "activity-title"?: string;
  minimum?: number;
  "extra-fields"?: ExtraField[];
  units?: string[];
  formula?: string;
}

export interface Prefill {
  key: string;
  value: string;
}

export interface SuggestedActivity {
  id: string;
  prefills: Prefill[];
}

export interface Methodology {
  id: string;
  disabled?: boolean;
  activities?: Activity[];
  inputRequired?: string[];
  formula?: string;
  fields?: any[];
  suggestedActivities?: SuggestedActivity[];
  suggestedActivitiesId?: string;
  activityTypeField?: string;
  activityUnitsField?: string;
}

export interface DirectMeasure {
  id: string;
  suggestedActivitiesId?: string;
  suggestedActivities?: Activity[];
  inputRequired?: string[];
  "extra-fields"?: ExtraField[];
  activityTypeField: string;
  activityUnitsField?: string;
}

interface ManualInputHierarchy {
  [key: string]: {
    methodologies?: Methodology[];
    directMeasure?: DirectMeasure;
  };
}

export const MANUAL_INPUT_HIERARCHY = HIERARCHY as ManualInputHierarchy;
