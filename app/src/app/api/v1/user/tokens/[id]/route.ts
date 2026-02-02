import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import createHttpError from "http-errors";

// DELETE /api/v1/user/tokens/:id - Revoke/delete a token
export const DELETE = apiHandler(async (_req, { session, params }) => {
  // 1. Check session.user.id exists, else 401 "Must be logged in"
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  // 2. Get id from params
  const { id } = params;

  // 3. Find token by id AND userId (security: only delete own tokens)
  const token = await db.models.PersonalAccessToken.findOne({
    where: {
      id,
      userId: session.user.id,
    },
  });

  // 4. If not found: throw 404 "Token not found"
  if (!token) {
    throw new createHttpError.NotFound("Token not found");
  }

  // 5. Destroy the token
  await token.destroy();

  // 6. Return { success: true }
  return NextResponse.json({ success: true });
});
