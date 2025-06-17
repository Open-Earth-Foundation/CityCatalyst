import EmailService from "@/backend/EmailService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { Organization } from "@/models/Organization";
import { apiHandler } from "@/util/api";
import { organizationActiveStateSchema } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const PATCH = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organization: organizationId } = params;

  const organization = await Organization.findByPk(organizationId);

  if (!organization) {
    throw createHttpError.NotFound("organization-not-found");
  }

  const validatedData = organizationActiveStateSchema.parse(await req.json());

  await organization.update({
    active: validatedData.active,
  });

  const admins = await db.models.OrganizationAdmin.findAll({
    where: { organizationId },
    include: { model: db.models.User, as: "user" },
  });
  const users = admins.map((admin) => admin?.user).filter((user) => user);

  if (validatedData.active) {
    // fire and forget
    EmailService.sendAccountActivatedNotification({
      users,
    });
  } else {
    // fire and forget
    EmailService.sendAccountFrozenNotification({
      users,
    });
  }

  return NextResponse.json(organization);
});
