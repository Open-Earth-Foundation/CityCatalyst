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

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createUserInvite.parse(await req.json());
  const city = await UserService.findUserCity(body.cityId, session);

  const cityData = await db.models.City.findOne({
    where: { cityId: city.cityId },
  });

  if (!cityData) {
    throw new createHttpError.NotFound("City not found");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign RESET_TOKEN_SECRET in env!");
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
  });

  if (!invite) {
    throw new createHttpError.BadRequest("Something went wrong");
  }
  const host = process.env.HOST ?? "http://localhost:3000";
  const sendInvite = await sendEmail({
    to: body.email!,
    subject: "City Catalyst - City Invitation",
    html: render(
      InviteUserTemplate({
        url: `${host}/api/v0/city/invite/${invite.id}?inventoryId=${body.inventoryId}&token=${invitationCode}&email=${body.email}`,
        user: { email: body.email, name: body.name },
        city,
        invitingUser: {
          name: session?.user.name!,
          email: session?.user.email!,
        },
        members: city.users,
      }),
    ),
  });

  if (!sendInvite)
    throw new createHttpError.BadRequest("Email could not be sent");

  return NextResponse.json({ data: invite });
});
