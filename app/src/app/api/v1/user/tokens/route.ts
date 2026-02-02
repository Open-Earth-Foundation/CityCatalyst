import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import { z } from "zod";
import { nanoid } from "nanoid";
import { hashToken } from "@/lib/auth/pat-validator";
import createHttpError from "http-errors";

const PAT_PREFIX = "cc_pat_";

const createTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(["read", "write"])).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Safe attributes for listing (no tokenHash!)
const SAFE_ATTRIBUTES = [
  "id",
  "name",
  "tokenPrefix",
  "scopes",
  "expiresAt",
  "lastUsedAt",
  "created",
];

// GET /api/v1/user/tokens - List user's tokens
export const GET = apiHandler(async (_req, { session }) => {
  // 1. Check session.user.id exists, else 401 "Must be logged in"
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  // 2. Find all tokens for user, only select safe fields (no tokenHash)
  // 3. Order by created DESC
  const tokens = await db.models.PersonalAccessToken.findAll({
    where: { userId: session.user.id },
    attributes: SAFE_ATTRIBUTES,
    order: [["created", "DESC"]],
  });

  // 4. Return { tokens: [...] }
  return NextResponse.json({ tokens });
});

// POST /api/v1/user/tokens - Create new token
export const POST = apiHandler(async (req, { session }) => {
  // 1. Check session.user.id exists, else 401 "Must be logged in"
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  // 2. Parse body with createTokenSchema
  const body = await req.json();
  const { name, scopes, expiresAt } = createTokenSchema.parse(body);

  // 3. Generate token: cc_pat_ + nanoid(32)
  const plainToken = PAT_PREFIX + nanoid(32);

  // 4. Hash token with hashToken()
  const tokenHash = hashToken(plainToken);

  // 5. Token prefix = first 12 chars of plainToken
  const tokenPrefix = plainToken.substring(0, 12);

  // 6. Create PersonalAccessToken in DB
  const token = await db.models.PersonalAccessToken.create({
    userId: session.user.id,
    name,
    tokenHash,
    tokenPrefix,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  // 7. Return 201 with { id, token (plaintext!), name, tokenPrefix, scopes, expiresAt, created }
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
