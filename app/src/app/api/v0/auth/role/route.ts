/**
 * @swagger
 * /api/v0/auth/role:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change a user's role
 *     description: Changes the role of a user. Only admins may call this endpoint.
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
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *     responses:
 *       200:
 *         description: Role updated successfully.
 *       400:
 *         description: User already has the specified role.
 *       403:
 *         description: Only admins can change roles.
 *       404:
 *         description: User not found.
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
