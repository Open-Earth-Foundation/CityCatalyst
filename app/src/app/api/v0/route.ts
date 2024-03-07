import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "Welcome to the CityCatalyst backend API!",
  });
});
