/**
 * @swagger
 * /api/v1/auth/verify:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Create a verification token for the current user.
 *     description: Issues a JWT verification token (valid for 1 hour) for the authenticated user. The token is used to verify the user's identity without exposing sensitive session data. Requires an authenticated session with a valid email. Use the returned token with the POST route to verify passwords without requiring re-authentication.
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
 *                   description: JWT verification token valid for 1 hour
 *             examples:
 *               example:
 *                 value:
 *                   verificationToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: User email missing in session or invalid session state.
 *       401:
 *         description: User is not authenticated.
 *       404:
 *         description: User not found in database.
 *       500:
 *         description: Configuration error or missing VERIFICATION_TOKEN_SECRET environment variable.
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

/**
 * @swagger
 * /api/v1/auth/verify:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Check if a password matches the user referenced by a token.
 *     description: Verifies the supplied password against the user identified by the JWT verification token. This endpoint doesn't require authentication - the token serves as proof of identity. Useful for password verification in scenarios where you want to avoid exposing session cookies or API keys. Returns true if the password matches the user's stored password hash.
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
 *                 description: Password to verify against the user identified by the token
 *                 minLength: 4
 *               token:
 *                 type: string
 *                 description: JWT verification token obtained from the GET endpoint
 *     responses:
 *       200:
 *         description: Password verification result.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comparePassword:
 *                   type: boolean
 *                   description: True if the provided password matches the user's stored password
 *             examples:
 *               example:
 *                 value:
 *                   comparePassword: true
 *       401:
 *         description: Invalid or expired JWT verification token.
 *       404:
 *         description: User referenced by token not found in database.
 *       422:
 *         description: Validation error - invalid password format or missing required fields.
 *       500:
 *         description: Configuration error or missing VERIFICATION_TOKEN_SECRET environment variable.
 */
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
