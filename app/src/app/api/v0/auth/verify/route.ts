/**
 * @swagger
 * /api/v0/auth/verify:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Create a verification token for the current user.
 *     description: Issues a short‑lived verification token for the authenticated user. Requires a signed‑in session; missing email or configuration produces errors. Use this token to validate the user’s password via the POST route.
 *     responses:
 *       200:
 *         description: Token wrapped in a JSON object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verificationToken:
 *                   type: string
 *             examples:
 *               example:
 *                 value:
 *                   verificationToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: User email missing in session.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Configuration error.
 *   post:
 *     tags:
 *       - Auth
 *     summary: Check if a password matches the user referenced by a token.
 *     description: Verifies the supplied password against the user identified by the verification token. No authentication is required; the token binds the identity. Returns a boolean result.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, token]
 *             properties:
 *               password:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comparison result.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comparePassword:
 *                   type: boolean
 *             examples:
 *               example:
 *                 value:
 *                   comparePassword: true
 *       500:
 *         description: Configuration error.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { passwordRegex } from "@/util/validation";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/services/logger";

const requestVerification = z.object({
  password: z.string().min(4),
  token: z.string(),
});

export const GET = apiHandler(async (_req, { session }) => {
  const email = session?.user.email;
  if (!email) {
    throw new createHttpError.BadRequest(
      "User doesn't have an email assigned!",
    );
  }

  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const verificationToken = jwt.sign(
    { email: email },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: "1h",
    },
  );

  return NextResponse.json({
    verificationToken,
  });
});

export const POST = apiHandler(async (req: Request) => {
  const body = requestVerification.parse(await req.json());

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const verificationTokenData = jwt.verify(
    body.token,
    process.env.VERIFICATION_TOKEN_SECRET,
  );
  const email = (<any>verificationTokenData).email;
  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  const comparePassword = await bcrypt.compare(
    body.password,
    user.passwordHash!,
  );

  return NextResponse.json({ comparePassword });
});
