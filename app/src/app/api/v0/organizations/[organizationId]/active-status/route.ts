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
  const { organizationId } = params;

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

  if (validatedData.active === true) {
    await EmailService.sendAccountActivatedNotification({
      users,
    });
  } else {
    await EmailService.sendAccountFrozenNotification({
      users,
    });
  }

  // send email to the admins in the organization that a new project was added.
  return NextResponse.json(organization);
});
