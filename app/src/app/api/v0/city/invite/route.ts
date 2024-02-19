import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest, createUserInvite } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";
import { render } from "@react-email/components";
import InviteUserTemplate from "@/lib/emails/InviteUserTemplate";

export const POST = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;

    const body = createUserInvite.parse(await _req.json());

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const user = await db.models.User.findOne({
      where: { userId: body.userId },
    });

    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    const city = await db.models.City.findOne({
      where: { locode: body.locode },
    });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }

    if (!process.env.VERIFICATION_TOKEN_SECRET) {
      console.error("Need to assign RESET_TOKEN_SECRET in env!");
      throw createHttpError.InternalServerError("Configuration error");
    }

    const invitationCode = jwt.sign(
      { email: user.email },
      process.env.VERIFICATION_TOKEN_SECRET,
      {
        expiresIn: "1h",
      },
    );

    const invite = await db.models.CityInvite.create({
      id: randomUUID(),
      ...body,
    });

    if (!invite) {
      throw new createHttpError.BadRequest("Something is wrong");
    }
    const host = process.env.HOST ?? "http://localhost:3000";
    const sendInvite = await sendEmail({
      to: user.email!,
      subject: "Test Invite",
      html: render(
        InviteUserTemplate({
          url: `${host}/api/v0/city/invite/${invite.id}?token=${invitationCode}`,
          user,
          city,
          invitee: { name: session.user.name, email: session.user.email },
        }),
      ),
    });

    if (!sendInvite)
      throw new createHttpError.BadRequest("Email could not be sent");

    return NextResponse.json({ data: invite });
  },
);
