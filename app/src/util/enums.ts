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

export enum NumberFormatEnum {
  DEFAULT = "default",
  COMMA_AND_DOT = "comma_and_dot",
  DOT_AND_COMMA = "dot_and_comma",
  SPACE_AND_COMMA = "space_and_comma",
  APOSTROPHE_AND_DOT = "apostrophe_and_dot",
}
