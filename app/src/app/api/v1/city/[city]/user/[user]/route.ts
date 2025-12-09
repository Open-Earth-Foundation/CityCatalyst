/**
 * @swagger
 * /api/v1/city/{city}/user/{user}:
 *   get:
 *     tags:
 *       - City Users
 *     operationId: getCityCityUserUser
 *     summary: Get a user in a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User returned.
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Roles } from "@/util/types";

export const GET = apiHandler(async (_req, { params, session }) => {
  const user = await UserService.findUser(params.user, session, {
    model: db.models.City,
    as: "cities",
  });
  return NextResponse.json({ data: user });
});

const updateUserRequest = z.object({
  name: z.string(),
  role: z.nativeEnum(Roles),
});

/**
 * @swagger
 * /api/v1/city/{city}/user/{user}:
 *   patch:
 *     tags:
 *       - City Users
 *     operationId: patchCityCityUserUser
 *     summary: Update a user in a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: user
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
 *             required: [name, role]
 *             properties:
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *     responses:
 *       200:
 *         description: User updated.
 *       404:
 *         description: User not found.
 */
export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = updateUserRequest.parse(await req.json());
  let user = await db.models.User.findOne({ where: { userId: params.user } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  user = await user.update(body);

  return NextResponse.json({ data: user });
});

/**
 * @swagger
 * /api/v1/city/{city}/user/{user}:
 *   delete:
 *     tags:
 *       - City Users
 *     operationId: deleteCityCityUserUser
 *     summary: Delete a user in a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted.
 */
export const DELETE = apiHandler(async (_req, { params, session }) => {
  const user = await UserService.findUser(params.user, session);
  await user.destroy();

  return NextResponse.json({ data: user, deleted: true });
});