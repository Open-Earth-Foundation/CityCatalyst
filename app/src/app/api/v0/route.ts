import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/v0:
 *   get:
 *     tags:
 *       - Root
 *     summary: API root endpoint with a welcome banner.
 *     description: Public endpoint that returns a simple welcome message indicating the API is reachable. No authentication is required. The response is a plain object with a message field.
 *     responses:
 *       200:
 *         description: Welcome message object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "Welcome to the CityCatalyst backend API!",
  });
});
