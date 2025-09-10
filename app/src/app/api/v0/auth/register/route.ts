/**
 * @swagger
 * /api/v0/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, confirmPassword, acceptTerms, preferredLanguage]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *               acceptTerms:
 *                 type: boolean
 *               inventory:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               preferredLanguage:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registered successfully.
 *       400:
 *         description: Email could not be sent or invalid input.
 */
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
import { Roles, LANGUAGES } from "@/util/types";
import i18next from "@/i18n/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req: Request) => {
  const body = signupRequest.parse(await req.json());
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.models.User.create({
    userId: randomUUID(),
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash,
    role: Roles.User,
    preferredLanguage: body.preferredLanguage,
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
          language: body.preferredLanguage,
        }),
      );
      const translatedSubject = i18next.t("welcome.subject", {
        lng: body.preferredLanguage || LANGUAGES.en,
        ns: "emails",
      });
      await sendEmail({
        to: body.email,
        subject: translatedSubject,
        html,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          email: body.email,
          language: body.preferredLanguage,
        },
        "Failed to send confirmation email",
      );
      throw new createHttpError.BadRequest("Email could not be sent");
    }
  }

  return NextResponse.json({
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
    },
  });
});
