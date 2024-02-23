import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);
  return NextResponse.json({ data: city });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);
  await city.destroy();
  return NextResponse.json({ data: city, deleted: true });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = createCityRequest.parse(await req.json());
  let city = await UserService.findUserCity(params.city, session);
  city = await city.update(body);
  return NextResponse.json({ data: city });
});
