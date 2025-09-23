/**
 * @swagger
 * /api/v0/city/invite:
 *   post:
 *     tags:
 *       - City Invites
 *     summary: Invite a user to a city
 *     description: Sends an email invite to the specified user to join the city.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invitingUserId, inventoryId, email, name, cityId]
 *             properties:
 *               invitingUserId:
 *                 type: string
 *                 format: uuid
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               cityId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Invite created and email sent.
 *       400:
 *         description: Email could not be sent or invalid input.
 *       401:
 *         description: Not authenticated.
 *       404:
 *         description: City not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserInvite } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";
import { render } from "@react-email/components";
import InviteUserTemplate from "@/lib/emails/InviteUserTemplate";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }
  const body = createUserInvite.parse(await req.json());
  const city = await UserService.findUserCity(body.cityId, session);

  const cityData = await db.models.City.findOne({
    where: { cityId: city.cityId },
    include: [
      {
        model: db.models.Project,
        as: "project",
        include: [
          {
            model: db.models.Organization,
            as: "organization",
          },
        ],
      },
    ],
  });

  if (!cityData) {
    throw new createHttpError.NotFound("City not found");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const invitationCode = jwt.sign(
    { email: body.email, reason: "invite", city: body.cityId },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: "7d",
    },
  );

  const invite = await db.models.CityInvite.create({
    id: randomUUID(),
    ...body,
    invitingUserId: session.user.id,
  });

  if (!invite) {
    throw new createHttpError.BadRequest("Something went wrong");
  }
  const host = process.env.HOST ?? "http://localhost:3000";
  // Get the inviting user's preferred language
  const invitingUser = await db.models.User.findByPk(session.user.id);

  const html = await render(
    InviteUserTemplate({
      url: `${host}/api/v0/city/invite/${invite.id}?inventoryId=${body.inventoryId}&token=${invitationCode}&email=${body.email}`,
      user: { email: body.email, name: body.name },
      city,
      invitingUser: {
        name: session?.user.name!,
        email: session?.user.email!,
      },
      members: city.users,
      language: invitingUser?.preferredLanguage,
    }),
  );

  const sendInvite = await sendEmail({
    to: body.email!,
    subject: "invite.subject",
    html,
  });

  if (!sendInvite)
    throw new createHttpError.BadRequest("Email could not be sent");

  return NextResponse.json({ data: invite });
});
