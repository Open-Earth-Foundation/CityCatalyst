/**
 * @swagger
 * /api/v1/auth/role:
 *   post:
 *     tags:
 *       - Auth
 *     operationId: postAuthRole
 *     summary: Update a user’s role (admin only).
 *     description: Sets the role for the target user to either admin or user. Requires an admin session; non‑admins receive 403. Returns a simple success flag on completion.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the user whose role will be changed
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: New role to assign to the user
 *     responses:
 *       200:
 *         description: User role successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates whether the role change was successful
 *             examples:
 *               example:
 *                 value:
 *                   success: true
 *       400:
 *         description: User already has the specified role or invalid role value.
 *       403:
 *         description: Only admin users can change roles.
 *       404:
 *         description: Target user not found.
 *       422:
 *         description: Validation error - invalid email format or missing required fields.
 *       500:
 *         description: Internal server error during role update.
 */
import { Roles } from "@/util/types";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const changeRoleRequest = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Roles),
});

export const POST = apiHandler(async (req, { session }) => {
  if (session?.user.role !== Roles.Admin) {
    throw new createHttpError.Forbidden("Can only be used by admin accounts");
  }
  const body = changeRoleRequest.parse(await req.json());
  const user = await db.models.User.findOne({ where: { email: body.email } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }
  if (user.role === body.role) {
    throw new createHttpError.BadRequest("User already has role " + body.role);
  }

  user.role = body.role;
  await user.save();

  return NextResponse.json({ success: true });
});
