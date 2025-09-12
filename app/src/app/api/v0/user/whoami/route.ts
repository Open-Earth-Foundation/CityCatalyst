/**
 * @swagger
 * /api/v0/user/whoami:
 *   get:
 *     tags:
 *       - User
 *     summary: Get the current session user object.
 *     description: Returns the session’s user payload (id, email, name, image, role). Requires a signed‑in session. Response is wrapped in { data }.
 *     responses:
 *       200:
 *         description: User wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     name: { type: string }
 *                     image: { type: string }
 *                     role: { type: string }
 *       401:
 *         description: Not signed in.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

/** Return user data */

export const GET = apiHandler(async (_req, { params, session }) => {

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  return NextResponse.json({
    data: session.user
  });
})
