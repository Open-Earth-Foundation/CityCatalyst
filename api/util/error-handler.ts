import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from './error-code';
import { ErrorException } from './error-exception';
import { ErrorResponse } from './error-response';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error occurred:', err);
  console.error('Path:', req.path);

  if (err instanceof ErrorException) {
    res.status(err.status).send(err);
  } else {
    res.status(500).send({ code: ErrorCode.UnknownError, status: 500 } as ErrorResponse);
  }
}

