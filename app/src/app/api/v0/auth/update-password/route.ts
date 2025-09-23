/**
 * @swagger
 * /api/v0/auth/update-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change the current user’s password.
 *     description: Validates the current password and sets a new one for the authenticated user. Requires a signed‑in session; non‑authenticated requests fail with 401/404. Returns a success flag indicating if the update persisted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               example:
 *                 value:
 *                   success: true
 *       400:
 *         description: Current password is incorrect.
 *       404:
 *         description: User not found or session expired.
 */
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { updatePasswordRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = updatePasswordRequest.parse(await req.json());
  const user = await UserService.findUser(session?.user.id!, session);

  if (!user) {
    throw new createHttpError.NotFound(
      "Something went wrong or your session has expired!",
    );
  }

  // Compare password to existing password
  const isPasswordValid = await bcrypt.compare(
    body.currentPassword,
    user.passwordHash!,
  );

  if (!isPasswordValid) {
    throw new createHttpError.BadRequest("Current password is incorrect!");
  }

  // Update password
  const passwordHash = await bcrypt.hash(body.confirmPassword, 10);
  const updatePassword = await user.update({ passwordHash });

  return NextResponse.json({ success: !!updatePassword });
});
