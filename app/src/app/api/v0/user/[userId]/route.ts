/**
 * @swagger
 * /api/v0/user/{userId}:
 *   patch:
 *     tags:
 *       - User
 *     summary: Update a user's profile
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, preferredLanguage]
 *             properties:
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               preferredLanguage:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated.
 *       404:
 *         description: User not found.
 */
import { db } from "@/models";
import { LANGUAGES } from "@/util/types";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateUserRequest = z.object({
  name: z.string(),
  title: z.string().optional(),
  preferredLanguage: z.nativeEnum(LANGUAGES),
});

export const PATCH = apiHandler(async (_req, { params, session }) => {
  const body = updateUserRequest.parse(await _req.json());
  let user = await db.models.User.findOne({ where: { userId: params.userId } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  user = await user.update(body);

  return NextResponse.json({ data: user });
});
