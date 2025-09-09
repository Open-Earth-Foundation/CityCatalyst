// Custom invite error types and classes

export enum InviteErrorCodes {
  EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS",
  INVALID_EMAIL_FORMAT = "INVALID_EMAIL_FORMAT",
  USER_ALREADY_IN_ORGANIZATION = "USER_ALREADY_IN_ORGANIZATION",
  ORGANIZATION_NOT_FOUND = "ORGANIZATION_NOT_FOUND",
  INVITATION_FAILED = "INVITATION_FAILED",
}

export interface InviteErrorData {
  errorKey: InviteErrorCodes;
  emails: string[];
  message?: string;
}

export interface InviteErrorResponse {
  data: {
    error: {
      data: InviteErrorData;
    };
  };
}

export class CustomInviteError extends Error implements InviteErrorResponse {
  data: {
    error: {
      data: InviteErrorData;
    };
  };

  constructor(errorData: InviteErrorData) {
    super(errorData.message || `Invite error: ${errorData.errorKey}`);
    this.name = "CustomInviteError";

    this.data = {
      error: {
        data: errorData,
      },
    };
  }
}
