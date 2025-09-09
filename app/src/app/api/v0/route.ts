import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/v0:
 *   get:
 *     description: Returns a welcome message.
 *     responses:
 *       200:
 *         description: Welcome to the CityCatalyst backend API!
 */
export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "Welcome to the CityCatalyst backend API!",
  });
});
