export enum InventoryTypeEnum {
  GPC_BASIC = "gpc_basic",
  GPC_BASIC_PLUS = "gpc_basic_plus",
}

export enum GlobalWarmingPotentialTypeEnum {
  ar6 = "ar6",
  ar5 = "ar5",
}

export enum ImportStatusEnum {
  UPLOADED = "uploaded",
  PROCESSING = "processing", // Combined validating + mapping step
  PENDING_AI_EXTRACTION = "pending_ai_extraction",
  PENDING_AI_INTERPRETATION = "pending_ai_interpretation", // Path B: tabular, await Interpret API
  EXTRACTING = "extracting", // Async AI extraction in progress (client polls)
  WAITING_FOR_APPROVAL = "waiting_for_approval",
  APPROVED = "approved",
  IMPORTING = "importing", // Processing the import after approval
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum OrganizationPlanType {
  TRIAL = "trial",
  DEMO = "demo",
  FULL = "full",
}

export enum NumberFormatEnum {
  DEFAULT = "default",
  COMMA_AND_DOT = "comma_and_dot",
  DOT_AND_COMMA = "dot_and_comma",
  SPACE_AND_COMMA = "space_and_comma",
  APOSTROPHE_AND_DOT = "apostrophe_and_dot",
}

export enum BulkInventoryImportJobStatus {
  PENDING = "pending",
  MATCHING = "matching",
  IMPORTING = "importing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum BulkInventoryImportItemStatus {
  PENDING = "pending",
  MATCHED = "matched",
  UNMATCHED = "unmatched",
  IMPORTING = "importing",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
}

export enum BulkInventoryImportMatchError {
  UNMATCHED_CITY = "unmatched_city",
  AMBIGUOUS_CITY = "ambiguous_city",
  MISSING_YEAR = "missing_year",
  UNSUPPORTED_EXTENSION = "unsupported_extension",
  FILE_TOO_LARGE = "file_too_large",
}
