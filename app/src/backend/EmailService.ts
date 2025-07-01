import createHttpError from "http-errors";
import type { User } from "@/models/User";
import { Organization } from "@/models/Organization";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";
import { render } from "@react-email/components";
import InviteToOrganizationTemplate from "@/lib/emails/InviteToOrganizationTemplate";
import { logger } from "@/services/logger";
import ProjectCreatedNotificationTemplate from "@/lib/emails/ProjectCreatedNotificationTemplate";
import { Project } from "@/models/Project";
import ProjectDeletedNotificationTemplate from "@/lib/emails/ProjectDeletedNotificationTemplate";
import CitySlotChangedNotificationTemplate from "@/lib/emails/CitySlotChangedNotification";
import AccountFrozenNotificationTemplate from "@/lib/emails/AccountFrozenNotificationTemplate";
import AccountUnFrozenNotificationTemplate from "@/lib/emails/AccountUnFrozenNotificationTemplate";
import { City } from "@/models/City";
import RemoveUserFromMultipleCitiesTemplate from "@/lib/emails/RemoveUsersFromMultipleCities";
import { LANGUAGES, OrganizationRole } from "@/util/types";
import RoleUpdateNotificationTemplate from "@/lib/emails/RoleUpdateNotificationTemplate";
import CitiesAddedToProjectNotificationTemplate from "@/lib/emails/CitiesAddedToProjectNotification";
import i18next from "@/i18n/server";
import InviteUserToMultipleCitiesTemplate from "@/lib/emails/InviteUserToMultipleCitiesTemplate";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import ForgotPasswordTemplate from "@/lib/emails/ForgotPasswordTemplate";
import InviteUserTemplate from "@/lib/emails/InviteUserTemplate";
import confirmRegistrationTemplate from "@/lib/emails/confirmRegistrationTemplate";
import { UserFileResponse } from "@/util/types";

interface EmailTranslation {
  subject: string;
  [key: string]: string | undefined;
}

export default class EmailService {
  static getTranslation(
    user: { preferredLanguage?: LANGUAGES } | null,
    key: string,
  ): EmailTranslation {
    const language = user?.preferredLanguage || LANGUAGES.en;

    // Split the key to handle nested translations like "invite-organization.subject"
    const keyParts = key.split(".");
    const baseKey = keyParts[0];
    const subKey = keyParts[1];

    const t = i18next.getFixedT(language, "emails");
    const translation = t(baseKey, { returnObjects: true });

    // If we have a subKey (like "subject"), return the specific property
    if (
      subKey &&
      translation &&
      typeof translation === "object" &&
      subKey in translation
    ) {
      return { [subKey]: (translation as any)[subKey] } as EmailTranslation;
    }

    // Otherwise return the full translation object
    return translation as EmailTranslation;
  }

  public static async sendOrganizationInvitationEmail(
    request: {
      email: string;
      organizationId: string;
      role: OrganizationRole;
    },
    organization: Organization,
    user: User | null,
  ) {
    const { email, organizationId, role } = request;

    if (!process.env.VERIFICATION_TOKEN_SECRET) {
      logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
      throw createHttpError.InternalServerError("configuration-error");
    }

    let expiresIn = process.env.VERIFICATION_TOKEN_EXPIRATION ?? "30d";
    const invitationCode = jwt.sign(
      {
        reason: "organization-invite",
        email,
        role,
        organizationId,
      },
      process.env.VERIFICATION_TOKEN_SECRET!,
      { expiresIn },
    );

    const host = process.env.HOST ?? "http://localhost:3000";
    const params = new URLSearchParams();

    // Add query parameters
    params.set("organizationId", organizationId);
    params.set("token", invitationCode);
    params.set("email", email);
    params.set("role", role);

    const url = `${host}/organization/invites?${params.toString()}`;
    const html = await render(
      InviteToOrganizationTemplate({
        url,
        organization,
        user,
        language: user?.preferredLanguage,
      }),
    );

    const translatedSubject = this.getTranslation(
      user,
      "invite-organization.subject",
    ).subject;

    return sendEmail({
      to: email,
      subject: translatedSubject,
      html,
    });
  }

  public static async sendProjectCreationNotificationEmail({
    project,
    users,
    organizationName,
  }: {
    project: Project;
    users: User[];
    organizationName: string;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";

    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            ProjectCreatedNotificationTemplate({
              url,
              organizationName,
              project,
              user, // pass the individual user to the template if needed
              language: user?.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "project-created.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendProjectDeletionNotificationEmail({
    project,
    users,
    organizationName,
  }: {
    project: Project;
    users: User[];
    organizationName: string;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";

    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            ProjectDeletedNotificationTemplate({
              url,
              organizationName,
              project,
              user,
              language: user?.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "project-deleted.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendCitySlotUpdateNotificationEmail({
    project,
    users,
    organizationName,
  }: {
    project: Project;
    users: User[];
    organizationName: string;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";

    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            CitySlotChangedNotificationTemplate({
              url,
              organizationName,
              project,
              user, // pass the individual user to the template if needed
              language: user?.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "city-slot-changed.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendAccountFrozenNotification({
    users,
  }: {
    users: User[];
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";

    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            AccountFrozenNotificationTemplate({
              url,
              user,
              language: user?.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "account-frozen.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendAccountActivatedNotification({
    users,
  }: {
    users: User[];
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";

    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            AccountUnFrozenNotificationTemplate({
              url,
              user,
              language: user?.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "account-unfrozen.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendChangeToCityAccessNotification({
    email,
    cities,
    brandInformation,
    user,
  }: {
    email: string;
    cities: City[];
    brandInformation?: {
      color: string;
      logoUrl: string;
    };
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/login`;

    try {
      const html = await render(
        RemoveUserFromMultipleCitiesTemplate({
          url,
          email: email as string,
          cities,
          brandInformation,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "remove-multiple-cities.subject",
      ).subject;

      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(
        { email, cities, error: err instanceof Error ? err.message : err },
        "Failed to send change to city access notification email",
      );
      throw err;
    }
  }

  public static async sendRoleUpdateNotification({
    email,
    organizationName,
    brandInformation,
    user,
  }: {
    email: string;
    organizationName: string;
    brandInformation?: {
      color: string;
      logoUrl: string;
    };
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/login`;

    try {
      const html = await render(
        RoleUpdateNotificationTemplate({
          url,
          email: email as string,
          organizationName,
          brandInformation,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "role-update.subject",
      ).subject;

      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(
        { email },
        "Failed to send change to organization role notification email",
      );
      throw err;
    }
  }

  public static async sendCityAddedNotification({
    users,
    brandInformation,
    project,
    organizationName,
    cities,
  }: {
    users: User[];
    brandInformation?: {
      color: string;
      logoUrl: string;
    };
    project: Project;
    organizationName: string;
    cities: City[];
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/login`;

    await Promise.all(
      users.map(async (user) => {
        try {
          const html = await render(
            CitiesAddedToProjectNotificationTemplate({
              url,
              user: {
                name: user.name as string,
                email: user.email as string,
              },
              project: {
                name: project.name,
              },
              organizationName,
              cities,
              brandInformation,
              language: user.preferredLanguage,
            }),
          );

          const translatedSubject = this.getTranslation(
            user,
            "cities-added.subject",
          ).subject;

          await sendEmail({
            to: user.email as string,
            subject: translatedSubject,
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }

  public static async sendInviteToMultipleCities({
    email,
    cities,
    invitingUser,
    brandInformation,
    user,
  }: {
    email: string;
    cities: City[];
    invitingUser: { name: string; email: string };
    brandInformation?: {
      color: string;
      logoUrl: string;
    };
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/login`;

    try {
      const html = await render(
        InviteUserToMultipleCitiesTemplate({
          url,
          email,
          cities,
          invitingUser,
          brandInformation,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "invite-multiple.subject",
      ).subject;

      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(`Failed to send email to ${email}`);
    }
  }

  public static async sendRemoveUserFromMultipleCities({
    email,
    cities,
    brandInformation,
    user,
  }: {
    email: string;
    cities: City[];
    brandInformation?: {
      color: string;
      logoUrl: string;
    };
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/login`;

    try {
      const html = await render(
        RemoveUserFromMultipleCitiesTemplate({
          url,
          email,
          cities,
          brandInformation,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "remove-multiple-cities.subject",
      ).subject;
      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(`Failed to send email to ${email}`);
    }
  }

  public static async sendInviteToOrganization({
    url,
    organization,
    user,
  }: {
    url: string;
    organization: Organization;
    user: User | null;
  }) {
    try {
      const html = await render(
        InviteToOrganizationTemplate({
          url,
          organization,
          user,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "invite-organization.subject",
      ).subject;

      await sendEmail({
        to: user?.email as string,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(`Failed to send email to ${user?.email}`);
    }
  }

  public static async sendAdminNotification({
    user,
    file,
    adminNames,
    inventoryId,
    userEmail,
    language,
  }: {
    user: { name: string; email: string; cityName: string };
    file: UserFileResponse;
    adminNames: string;
    inventoryId: string;
    userEmail: string;
    language?: string;
  }) {
    try {
      const html = await render(
        AdminNotificationTemplate({
          user,
          file,
          adminNames,
          inventoryId,
          language: language || LANGUAGES.en,
        }),
      );

      const translatedSubject = this.getTranslation(
        { preferredLanguage: (language as LANGUAGES) || LANGUAGES.en },
        "admin-notification.subject",
      ).subject;

      await sendEmail({
        to: userEmail,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(
        { userEmail, error: err instanceof Error ? err.message : err },
        "Failed to send admin notification email",
      );
      throw err;
    }
  }

  public static async sendForgotPassword({
    email,
    token,
    user,
  }: {
    email: string;
    token: string;
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/reset-password?token=${token}`;

    try {
      const html = await render(
        ForgotPasswordTemplate({
          url,
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "reset-password.subject",
      ).subject;

      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(
        { email, error: err instanceof Error ? err.message : err },
        "Failed to send forgot password email",
      );
      throw err;
    }
  }

  public static async sendInviteUser({
    url,
    user,
    city,
    invitingUser,
    members,
    userEmail,
    language,
  }: {
    url?: string;
    user?: { name: string; email: string; cityId?: string };
    city?: any;
    invitingUser?: { name: string; email: string };
    members: any[];
    userEmail: string;
    language?: string;
  }) {
    try {
      const html = await render(
        InviteUserTemplate({
          url,
          user,
          city,
          invitingUser,
          members,
          language: language || LANGUAGES.en,
        }),
      );

      const translatedSubject = this.getTranslation(
        { preferredLanguage: (language as LANGUAGES) || LANGUAGES.en },
        "invite.subject",
      ).subject;

      await sendEmail({
        to: userEmail,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error(`Failed to send email to ${userEmail}`);
    }
  }

  public static async sendConfirmRegistration({
    email,
    token,
    user,
  }: {
    email: string;
    token: string;
    user: User | null;
  }) {
    const host = process.env.HOST ?? "http://localhost:3000";
    const url = `${host}/confirm-registration?token=${token}`;

    try {
      const html = await render(
        confirmRegistrationTemplate({
          url,
          user: { name: user?.name || "User" },
          language: user?.preferredLanguage,
        }),
      );

      const translatedSubject = this.getTranslation(
        user,
        "welcome.subject",
      ).subject;

      await sendEmail({
        to: email,
        subject: translatedSubject,
        html,
      });
    } catch (err) {
      logger.error({ email }, "Failed to send confirm registration email");
    }
  }
}
