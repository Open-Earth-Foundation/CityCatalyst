import { sendEmail } from "@/lib/email";
import ConfirmRegistrationTemplate from "@/lib/emails/confirmRegistrationTemplate";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { signupRequest } from "@/util/validation";
import { render } from "@react-email/components";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Roles } from "@/util/types";

export const POST = apiHandler(async (req: Request) => {
  const body = signupRequest.parse(await req.json());
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.models.User.create({
    userId: randomUUID(),
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash,
    role: Roles.User,
  });

  if (body.inventory) {
    const inventory = await db.models.Inventory.findOne({
      where: {
        inventoryId: body.inventory,
      },
    });

    await user.addCity(inventory?.cityId);
  }

  // Send email to user
  const host = process.env.HOST ?? "http://localhost:3000";

  if (process.env.EMAIL_ENABLED === "true") {
    try {
      const html = await render(
        ConfirmRegistrationTemplate({
          url: `${host}/dashboard`,
          user: { name: body.name },
        }),
      );
      await sendEmail({
        to: body.email,
        subject: "City Catalyst - User Registration",
        html,
      });
    } catch (error) {
      throw new createHttpError.BadRequest("Email could not be sent");
    }
  }

  return NextResponse.json({
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});
