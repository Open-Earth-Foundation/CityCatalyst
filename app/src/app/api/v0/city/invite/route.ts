import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";

export const POST = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;

    const body = await _req.json();

    console.log(body);

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const user = await db.models.User.findOne({
      where: { userId: body.userId },
    });

    if (!user) {
      throw new createHttpError.NotFound("User not found");
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
      invitationCode,
      ...body,
    });

    if (!invite) {
      throw new createHttpError.BadRequest("Something is wrong");
    }

    const sendInvite = await sendEmail({
      to: user.email!,
      subject: "Test Invite",
      html: `<a href='http://localhost:3000/api/v0/city/${body.locode}/invite/${invite.id}?token=${invitationCode}>Hello world</a>`,
    });

    if (sendInvite) console.log(sendInvite);

    return NextResponse.json({ data: invite });
  },
);
