import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { updateUserRoleSchema } from "@/util/validation";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import EmailService from "@/backend/EmailService";
import { Organization } from "@/models/Organization";
import createHttpError from "http-errors";
import { Theme } from "@/models/Theme";
import { InviteStatus, OrganizationRole } from "@/util/types";
import { logger } from "@/services/logger";
import { OrganizationInvite } from "@/models/OrganizationInvite";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const { organization: organizationId } = params;
  const { contactEmail: email } = updateUserRoleSchema.parse(await req.json());
  UserService.validateIsAdmin(session);

  const org = await Organization.findByPk(organizationId as string, {
    include: [{ model: Theme, as: "theme" }],
  });
  if (!org) throw new createHttpError.NotFound("organization-not-found");

  const user = await db.models.User.findOne({ where: { email } });

  const transaction = await db.sequelize!.transaction();
  try {
    if (user) {
      // Step 1: Promote to OrganizationAdmin
      await db.models.OrganizationAdmin.create(
        {
          organizationAdminId: randomUUID(),
          organizationId,
          userId: user.userId,
        },
        { transaction },
      );

      // Step 2: Clean up city-level associations
      const cityUserRecords = await db.models.CityUser.findAll({
        where: {
          userId: user.userId,
        },
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                where: { organizationId },
              },
            ],
          },
        ],
        transaction,
      });

      const cityInviteRecords = await db.models.CityInvite.findAll({
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                where: { organizationId },
              },
            ],
          },
        ],
        transaction,
      });

      await db.models.CityUser.destroy({
        where: {
          userId: user.userId,
          cityId: cityUserRecords.map((r) => r.cityId as string),
        },
        transaction,
      });

      await db.models.CityInvite.destroy({
        where: {
          email,
          cityId: cityInviteRecords.map((r) => r.cityId as string),
        },
        transaction,
      });

      await transaction.commit();

      // Send role upgrade email after successful commit
      await EmailService.sendRoleUpdateNotification({
        email,
        brandInformation: {
          color: org.theme.primaryColor,
          logoUrl: org.logoUrl as string,
        },
        organizationName: org.name as string,
        user,
      });

      return NextResponse.json({ success: true });
    }

    // Handle invite creation for non-users
    let invite = await OrganizationInvite.findOne({
      where: { email, organizationId },
      transaction,
    });

    if (invite) {
      if (invite.status !== InviteStatus.ACCEPTED) {
        await invite.update({ status: InviteStatus.PENDING }, { transaction });
      }
    } else {
      invite = await OrganizationInvite.create(
        {
          id: randomUUID(),
          organizationId,
          email,
          role: OrganizationRole.ORG_ADMIN,
          status: InviteStatus.PENDING,
        },
        { transaction },
      );

      // Clean up city-level invites
      const cityInviteRecords = await db.models.CityInvite.findAll({
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                where: { organizationId },
              },
            ],
          },
        ],
        transaction,
      });

      await db.models.CityInvite.destroy({
        where: {
          email,
          cityId: cityInviteRecords.map((r) => r.cityId as string),
        },
        transaction,
      });
    }

    await transaction.commit();

    const emailSent = await EmailService.sendOrganizationInvitationEmail(
      {
        email,
        organizationId,
        role: OrganizationRole.ORG_ADMIN,
      },
      org,
      null,
    );

    if (!emailSent) {
      logger.error({ email }, "Failed to send org invite email");
      throw createHttpError.InternalServerError("email-error");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    logger.error(err, "Transaction failed in PATCH /organization/:id/role");
    throw err;
  }
});
