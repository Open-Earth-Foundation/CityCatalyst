/**
 * @swagger
 * /api/v0/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Create a new user account and send a welcome email.
 *     description: Registers a user with name, email, password, and preferred language and optionally associates them to an inventory’s city. Public endpoint; no prior authentication required. Returns a minimal user object on success.
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
 *                 description: Full name of the user
 *                 minLength: 4
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Valid email address for account creation and notifications
 *               password:
 *                 type: string
 *                 description: Must be at least 4 characters with at least one lowercase letter, one uppercase letter, and one number
 *                 minLength: 4
 *               confirmPassword:
 *                 type: string
 *                 description: Must match the password field exactly
 *               acceptTerms:
 *                 type: boolean
 *                 description: Must be true to accept the terms and conditions
 *               inventory:
 *                 type: string
 *                 format: uuid
 *                 description: Optional inventory ID to associate the user with a city's inventory
 *               preferredLanguage:
 *                 type: string
 *                 enum: ['en', 'es', 'pt', 'de', 'fr']
 *                 description: User's preferred language for the application
 *     responses:
 *       200:
 *         description: Minimal user object wrapped in user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                       description: Unique identifier for the user
 *                     name:
 *                       type: string
 *                       description: Full name of the user
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: User's email address
 *                     role:
 *                       type: string
 *                       description: User's role in the system
 *                     preferredLanguage:
 *                       type: string
 *                       description: User's preferred language setting
 *             examples:
 *               example:
 *                 value:
 *                   user:
 *                     userId: "7c0c4b9a-7b60-4f63-b4cc-7b4bcae6a111"
 *                     name: "Jane Doe"
 *                     email: "jane@example.com"
 *                     role: "user"
 *                     preferredLanguage: "en"
 *       400:
 *         description: Email could not be sent or invalid input.
 *       422:
 *         description: Validation error - invalid or missing required fields.
 *       500:
 *         description: Internal server error during user creation or email processing.
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
