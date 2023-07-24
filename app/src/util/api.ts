import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiHandler(handler: (req: Request) => Promise<NextResponse>) {
  return async (req: Request) => {
    try {
      // TODO JWT authentication logic here
      return await handler(req);
    } catch (err) {
      return errorHandler(err, req);
    }
  };
}

function errorHandler(err: unknown, req: Request) {
  if (createHttpError.isHttpError(err) && err.expose) {
    return NextResponse.json({ error: { message: err.message } }, { status: err.statusCode });
  } else if (err instanceof ZodError) {
    return NextResponse.json({ error: { message: 'Invalid request', issues: err.issues } }, { status: 400 });
  } else {
    return NextResponse.json({ error: { nessage: 'Internal server error', error: err } }, { status: 500 });
  }
}

