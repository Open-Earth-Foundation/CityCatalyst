// Custom organization error types and classes

export enum OrganizationErrorCodes {
  NAME_ALREADY_EXISTS = "NAME_ALREADY_EXISTS",
  ORGANIZATION_NOT_FOUND = "ORGANIZATION_NOT_FOUND",
  INVALID_ORGANIZATION_NAME = "INVALID_ORGANIZATION_NAME",
  CREATION_FAILED = "CREATION_FAILED",
}

export interface OrganizationErrorData {
  errorKey: OrganizationErrorCodes;
  organizationName?: string;
  message?: string;
}

export interface OrganizationErrorResponse {
  data: {
    error: {
      data: OrganizationErrorData;
    };
  };
}

export class CustomOrganizationError extends Error implements OrganizationErrorResponse {
  data: {
    error: {
      data: OrganizationErrorData;
    };
  };

  constructor(errorData: OrganizationErrorData) {
    super(errorData.message || `Organization error: ${errorData.errorKey}`);
    this.name = "CustomOrganizationError";

    this.data = {
      error: {
        data: errorData,
      },
    };
  }
}