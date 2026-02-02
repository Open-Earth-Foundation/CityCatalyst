/**
 * @swagger
 * /api/v1/user/tokens/{id}:
 *   delete:
 *     tags:
 *       - user
 *     operationId: deletePersonalAccessToken
 *     summary: Delete a personal access token
 *     description: Revokes and deletes a personal access token. Any applications using this token will lose access.
 *     security:
 *       - bearerAuth: []
 *       - sessionAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The token ID to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Token not found
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import createHttpError from "http-errors";

export const DELETE = apiHandler(async (_req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Must be logged in");
  }

  const { id } = params;

  const token = await db.models.PersonalAccessToken.findOne({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!token) {
    throw new createHttpError.NotFound("Token not found");
  }

  await token.destroy();

  return NextResponse.json({ success: true });
});
