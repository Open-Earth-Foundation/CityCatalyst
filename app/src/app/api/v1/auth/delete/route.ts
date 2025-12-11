/**
 * @swagger
 * /api/v1/auth/delete:
 *   post:
 *     tags:
 *       - auth
 *     operationId: postAuthDelete
 *     summary: Delete the authenticated user’s account.
 *     description: Removes the user record for the currently signed‑in session. Requires a signed‑in user; requests without a session return 401. Use with caution as this operation is irreversible.
 *     responses:
 *       200:
 *         description: Account successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates whether the account deletion was successful
 *             examples:
 *               example:
 *                 value:
 *                   success: true
 *       401:
 *         description: User must be authenticated to delete account.
 *       404:
 *         description: User email not found in session or user does not exist.
 *       500:
 *         description: Internal server error during account deletion.
 */
import { authOptions } from "@/lib/auth";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req: NextRequest) => {
  logger.debug(req.cookies, "Cookies");
  const token = await getToken({ req });
  logger.debug(token, "Token");
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  if (!session.user?.email) {
    throw new createHttpError.NotFound("Email not found in session!");
  }

  await db.models.User.destroy({
    where: {
      email: session.user.email,
    },
  });

  return NextResponse.json({ success: true });
});
