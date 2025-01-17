import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { CreateUsersInvite } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";
import { render } from "@react-email/components";
import { InviteUserToMultipleCitiesTemplate } from "@/lib/emails/InviteUserToMultipleCitiesTemplate";
import { Op } from "sequelize";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Not signed in");
  }
  const inviteRequest = CreateUsersInvite.parse(await req.json());
  const { emails, cityIds } = inviteRequest;
  const userCities = await db.models.CityUser.findAll({
    where: { cityId: { [Op.in]: cityIds }, userId: session?.user.id },
  });

  if (userCities.length !== cityIds.length) {
    throw new createHttpError.NotFound("City not found");
  }

  const cities = await db.models.City.findAll({
    where: { cityId: { [Op.in]: cityIds } },
  });

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const failedInvites: { email: string; cityIds: string[] }[] = [];

  await Promise.all(
    emails.map(async (email) => {
      const inviteData = { email, cityIds };
      try {
        const invitationCode = jwt.sign(
          { email: email, reason: "invite", cities: cityIds },
          process.env.VERIFICATION_TOKEN_SECRET!,
          {
            expiresIn: "30d",
          },
        );
        const invites = await Promise.all(
          cityIds.map(async (cityId) => {
            const invite = await db.models.CityInvite.create({
              id: randomUUID(),
              cityId,
              email,
              invitingUserId: session.user.id,
            });

            if (!invite) {
              failedInvites.push({ email, cityIds: [cityId] });
              logger.error(
                "error in invites/route POST: ",
                "error creating invite",
                { cityId, email },
              );
            }
            return invite;
          }),
        );
        const host = process.env.HOST ?? "http://localhost:3000";
        const url = `${host}/user/invite?cityIds=${encodeURIComponent(invites.map((i) => i.cityId).join(","))}&token=${encodeURIComponent(invitationCode)}&email=${encodeURIComponent(email)}`;
        const sendInvite = await sendEmail({
          to: email!,
          subject: "City Catalyst - City Invitation",
          html: render(
            InviteUserToMultipleCitiesTemplate({
              url,
              email,
              cities: cities,
              invitingUser: {
                name: session?.user.name!,
                email: session?.user.email!,
              },
            }),
          ),
        });
        if (!sendInvite) {
          logger.error(
            "error in invites/route POST: ",
            "Email could not be sent",
            { email, cityIds },
          );
          logger.error("error in invites/route POST: ", inviteData);
          failedInvites.push(inviteData);
        }
      } catch (error) {
        failedInvites.push(inviteData);
        logger.error("error in invites/route POST: ", inviteData, error);
      }
    }),
  );
  if (failedInvites.length > 0) {
    throw new createHttpError.InternalServerError("Something went wrong");
  }
  return NextResponse.json({ success: failedInvites.length === 0 });
});
