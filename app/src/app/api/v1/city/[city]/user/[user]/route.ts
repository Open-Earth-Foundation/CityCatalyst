/**
 * @swagger
 * /api/v1/city/{city}/user/{user}:
 *   get:
 *     tags:
 *       - city
 *       - users
 *     operationId: getCityUser
 *     summary: Get a user in a city
 *     description: Retrieves user information for a specific user within a city context. Returns user details including their association with the city. Requires authentication and access to the city.
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
 *       - city
 *       - users
 *     operationId: patchCityUser
 *     summary: Update a user in a city
 *     description: Updates user information within a city context, including name and role. Requires authentication and appropriate permissions. Returns the updated user data.
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
 *       - city
 *       - users
 *     operationId: deleteCityUser
 *     summary: Delete a user in a city
 *     description: Permanently deletes a user from the system. This action removes the user and all associated data. Requires authentication and appropriate permissions. Returns the deleted user data with a deleted flag.
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
