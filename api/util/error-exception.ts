import { ErrorCode } from './error-code';

export class ErrorException extends Error {
  public status: number = 500;
  public details: any = null;

  constructor(code: string = ErrorCode.UnknownError, details: any = null) {
    super(code);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = code;
    this.status = 500;
    this.details = details;

    switch (code) {
      case ErrorCode.Unauthenticated:
        this.status = 401;
        break;
      case ErrorCode.Validation:
      case ErrorCode.AsyncError:
        this.status = 400;
        break;
      case ErrorCode.NotFound:
        this.status = 404;
        break;
      default:
        this.status = 500;
    }
  }
}

