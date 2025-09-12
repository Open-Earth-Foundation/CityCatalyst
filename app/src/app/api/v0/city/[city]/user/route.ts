/**
 * @swagger
 * /api/v0/city/{city}/user:
 *   get:
 *     tags:
 *       - City Users
 *     summary: List users for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Users returned.
 *       404:
 *         description: Users not found.
 *   post:
 *     tags:
 *       - City Users
 *     summary: Look up a user by email
 *     description: Returns an existing user if found; otherwise returns a message.
 *     parameters:
 *       - in: path
 *         name: city
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
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: User found or message returned.
 *   delete:
 *     tags:
 *       - City Users
 *     summary: Remove a user from a city by email
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: User removed.
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = await req.json();

  // check if the user exists

  const existingUser = await db.models.User.findOne({
    where: { email: body.email! },
  });

  if (!existingUser) {
    // return a message to ui for the flow to continue and not break
    return NextResponse.json({ message: "User not found" });
  }

  return NextResponse.json({ data: existingUser });
});

export const GET = apiHandler(async (req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);

  const users = await db.models.User.findAll({
    include: [
      {
        model: db.models.City,
        where: { cityId: city.cityId },
        as: "cities",
        required: true,
        attributes: ["cityId"],
      },
    ],
  });

  if (!users) {
    throw new createHttpError.NotFound("Users not found");
  }

  return NextResponse.json({ data: users });
});

export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { city } = params;

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }

  await UserService.removeUserFromCity(city as string, email);

  return NextResponse.json(null);
});
