import createHttpError from "http-errors";

export enum ManualInputValidationErrorCodes {
  EXCLUSIVE_CONFLICT = "EXCLUSIVE_CONFLICT", // trying to insert a value when an existing ActivityValue has an exclusive value
  EXCLUSIVE_CONFLICT_SECONDARY = "EXCLUSIVE_CONFLICT_SECONDARY", // trying to insert an exclusive value when an existing ActivityValue has any value
  UNIQUE_BY_CONFLICT = "UNQUE_BY_CONFLICT",
  REQUIRED_FIELD_MISSING = "REQUIRED_FIELD_MISSING",
}

export interface ValidationErrorDetails {
  code: ManualInputValidationErrorCodes;
  targetFields: string[];
  meta?: {
    exclusiveFieldValue?: string;
    targetValue?: string;
  };
}

export class ManualInputValidationError {
  constructor(details: ValidationErrorDetails) {
    this.details = details;
  }

  details: ValidationErrorDetails;
}
