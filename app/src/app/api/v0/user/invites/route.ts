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
import { InviteStatus, Roles } from "@/util/types";

import { subDays } from "date-fns";
import { mockSession } from "next-auth/client/__tests__/helpers/mocks";

export const GET = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Not signed in");
  }

  const invites = await db.models.CityInvite.findAll({
    where: {
      invitingUserId: session?.user.id,
      status: { [Op.ne]: InviteStatus.CANCELED },
    },
    include: [
      {
        model: db.models.City,
        as: "cityInvites",
        required: true,
      },
      {
        model: db.models.User,
        as: "user",
        required: false,
        attributes: ["userId", "name", "email", "role"],
      },
    ],
  });

  const now = new Date();

  for (const invite of invites) {
    if (
      invite.status === InviteStatus.PENDING &&
      new Date(invite.lastUpdated!) < subDays(now, 30)
    ) {
      invite.status = InviteStatus.EXPIRED;
      await invite.save();
    }
  }

  return NextResponse.json({ data: invites });
});

export const POST = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Not signed in");
  }
  const inviteRequest = CreateUsersInvite.parse(await req.json());
  const { emails, cityIds } = inviteRequest;

  interface WhereConditions {
    cityId: { [Op.in]: string[] };
    userId?: string;
  }

  const whereConditions: WhereConditions = {
    cityId: { [Op.in]: cityIds },
  };

  if (!(session.user.role === Roles.Admin)) {
    whereConditions.userId = session.user.id;
  }

  const userCities = await db.models.CityUser.findAll({
    where: whereConditions,
  });

  if (userCities.length !== cityIds.length) {
    throw new createHttpError.NotFound("City not found");
  }

  const cities = await db.models.City.findAll({
    where: { cityId: { [Op.in]: cityIds } },
  });

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
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
            const existingInvite = await db.models.CityInvite.findOne({
              where: { email, cityId },
            });

            if (existingInvite) {
              if (existingInvite.status !== InviteStatus.ACCEPTED) {
                await existingInvite.update({
                  status: InviteStatus.PENDING,
                });
              }
              return existingInvite;
            } else {
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
            }
          }),
        );
        // Check if invited user exists then flag that user if they don't exist in the database

        const doesInvitedUserExist = await db.models.User.findOne({
          where: { email },
        });
        const host = process.env.HOST ?? "http://localhost:3000";
        const params = new URLSearchParams();

        // Add query parameters
        params.set("cityIds", invites.map((i) => i.cityId).join(","));
        params.set("token", invitationCode);
        params.set("email", email);
        params.set(
          "doesInvitedUserExist",
          doesInvitedUserExist ? "true" : "false",
        );
        const url = `${host}/user/invites?${params.toString()}`;
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
