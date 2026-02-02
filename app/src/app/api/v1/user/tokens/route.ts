/**
 * @swagger
 * /api/v1/user/tokens:
 *   get:
 *     tags:
 *       - user
 *     operationId: listPersonalAccessTokens
 *     summary: List user's personal access tokens
 *     description: Returns all personal access tokens for the authenticated user
 *     security:
 *       - bearerAuth: []
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: List of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       tokenPrefix:
 *                         type: string
 *                       scopes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       expiresAt:
 *                         type: string
 *                         nullable: true
 *                       lastUsedAt:
 *                         type: string
 *                         nullable: true
 *                       created:
 *                         type: string
 *       401:
 *         description: Not authenticated
 *   post:
 *     tags:
 *       - user
 *     operationId: createPersonalAccessToken
 *     summary: Create a new personal access token
 *     description: Creates a new PAT for API access. The token is only returned once.
 *     security:
 *       - bearerAuth: []
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, scopes]
 *             properties:
 *               name:
 *                 type: string
 *                 description: A descriptive name for the token
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Token created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: The plaintext token (only shown once)
 *                 name:
 *                   type: string
 *                 tokenPrefix:
 *                   type: string
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 expiresAt:
 *                   type: string
 *                   nullable: true
 *                 created:
 *                   type: string
 *       401:
 *         description: Not authenticated
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import { z } from "zod";
import { nanoid } from "nanoid";
import { hashToken } from "@/lib/auth/access-token-validator";
import createHttpError from "http-errors";

const PAT_PREFIX = "cc_pat_";

const createTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(["read", "write"])).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

const SAFE_ATTRIBUTES = [
  "id",
  "name",
  "tokenPrefix",
  "scopes",
  "expiresAt",
  "lastUsedAt",
  "created",
];

export const GET = apiHandler(async (_req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const tokens = await db.models.PersonalAccessToken.findAll({
    where: { userId: session.user.id },
    attributes: SAFE_ATTRIBUTES,
    order: [["created", "DESC"]],
  });

  return NextResponse.json({ tokens });
});

export const POST = apiHandler(async (req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const body = await req.json();
  const { name, scopes, expiresAt } = createTokenSchema.parse(body);

  const plainToken = PAT_PREFIX + nanoid(32);
  const tokenHash = hashToken(plainToken);
  const tokenPrefix = plainToken.substring(0, 12);

  const token = await db.models.PersonalAccessToken.create({
    userId: session.user.id,
    name,
    tokenHash,
    tokenPrefix,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  return NextResponse.json(
    {
      id: token.id,
      token: plainToken,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
      created: token.created,
    },
    { status: 201 },
  );
});
