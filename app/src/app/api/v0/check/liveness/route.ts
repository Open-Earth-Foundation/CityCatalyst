import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import pkg from "../../../../../../package.json";

export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "alive",
    version: pkg.version
  });
});