import "@/util/big_int_json";

import { AppSession, Auth } from "@/lib/auth";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { StreamingTextResponse } from "ai";
import OpenAI from "openai";

import { db } from "@/models";
import { ValidationError } from "sequelize";
import { ManualInputValidationError } from "@/lib/custom-errors/manual-input-error";
import { logger } from "@/services/logger";

export type ApiResponse = NextResponse | StreamingTextResponse;

export type NextHandler = (
  req: NextRequest,
  props: { params: Record<string, string>; session: AppSession | null },
) => Promise<ApiResponse>;

export function apiHandler(handler: NextHandler) {
  return async (
    req: NextRequest,
    props: { params: Promise<Record<string, string>> },
  ) => {
    const startTime = Date.now();
    let result: ApiResponse;
    let session: AppSession | null = null;
    let error: Error | null = null;
    try {
      if (!db.initialized) {
        await db.initialize();
      }

      session = await Auth.getServerSession();
      const context = {
        params: await props.params,
        session,
      };

      result = await handler(req, context);
    } catch (err) {
      error = err as Error;
      result = errorHandler(err, req);
    }

    const record = {
      method: req.method,
      path: new URL(req.url).pathname,
      status: result.status,
      user: session?.user?.email,
      duration: Date.now() - startTime,
      error: error ? error.message : undefined,
    };

    if (result.status >= 500) {
      logger.error(record);
    } else if (result.status >= 400) {
      logger.warn(record);
    } else {
      logger.info(record);
    }

    return result;
  };
}

function errorHandler(err: unknown, _req: NextRequest) {
  // TODO log structured request info like route here
  logger.error(err);
  if (err instanceof ManualInputValidationError) {
    return NextResponse.json(
      {
        error: {
          type: "ManualInputValidationError",
          message: "Manual Input Validation Error",
          issues: err.details,
        },
      },
      { status: 400 },
    );
  } else if (createHttpError.isHttpError(err) && err.expose) {
    return NextResponse.json(
      { error: { message: err.message } },
      { status: err.statusCode },
    );
  } else if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { message: "Invalid request", issues: err.issues } },
      { status: 400 },
    );
  } else if (err instanceof SyntaxError) {
    return NextResponse.json(
      { error: { message: "Invalid request - " + err.message } },
      { status: 400 },
    );
  } else if (
    err instanceof ValidationError &&
    err.name === "SequelizeUniqueConstraintError"
  ) {
    return NextResponse.json(
      { error: { message: "Entity exists already.", issues: err.errors } },
      { status: 400 },
    );
  } else if (err instanceof OpenAI.APIError) {
    const { name, status, headers, message } = err;
    return NextResponse.json({ name, status, headers, message }, { status });
  } else {
    let errorMessage = "Unknown error";
    if ((err as Object).hasOwnProperty("message")) {
      errorMessage = (err as Error).message;
    } else if (err instanceof Error) {
      errorMessage = (err as Object).toString();
    }
    return NextResponse.json(
      { error: { message: "Internal server error", error: errorMessage } },
      { status: 500 },
    );
  }
}
