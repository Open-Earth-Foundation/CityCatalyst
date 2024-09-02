import "@/util/big_int_json";

import { AppSession, Auth } from "@/lib/auth";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { StreamingTextResponse } from "ai";
import OpenAI from "openai";

import { db } from "@/models";
import { ValidationError } from "sequelize";
import { ManualInputValidationError } from "@/lib/custom-errors.ts/manual-input-error";

export type NextHandler = (
  req: NextRequest,
  props: { params: Record<string, string>; session: AppSession | null },
) => Promise<NextResponse | StreamingTextResponse>;

export function apiHandler(handler: NextHandler) {
  return async (
    req: NextRequest,
    props: { params: Record<string, string> },
  ) => {
    try {
      if (!db.initialized) {
        await db.initialize();
      }

      const session = await Auth.getServerSession();
      const context = {
        ...props,
        session,
      };

      return await handler(req, context);
    } catch (err) {
      return errorHandler(err, req);
    }
  };
}

function errorHandler(err: unknown, _req: NextRequest) {
  // TODO log structured request info like route here
  console.error(err);
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
    return NextResponse.json(
      { error: { message: "Internal server error", error: err } },
      { status: 500 },
    );
  }
}
