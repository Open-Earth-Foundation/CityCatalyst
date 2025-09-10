import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/v0:
 *   get:
 *     tags:
 *       - Root
 *     summary: API root
 *     description: Returns a welcome message for the CityCatalyst backend API.
 *     responses:
 *       200:
 *         description: Welcome to the CityCatalyst backend API!
 */
export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "Welcome to the CityCatalyst backend API!",
  });
});
