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
  WAITING_FOR_APPROVAL = "waiting_for_approval",
  APPROVED = "approved",
  IMPORTING = "importing", // Processing the import after approval
  COMPLETED = "completed",
  FAILED = "failed",
}