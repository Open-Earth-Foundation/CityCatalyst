import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { getClient } from "@/util/client";

/** gets a client based on client ID */
export const GET = apiHandler(async (_req, { params, session }) => {

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  const { client: clientId } = params

  const client = await getClient(clientId)

  if (!client) {
    throw new createHttpError.NotFound(`No client with id ${clientId}`);
  }

  return NextResponse.json({ data: client });
})