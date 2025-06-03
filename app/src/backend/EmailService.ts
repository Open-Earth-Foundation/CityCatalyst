import createHttpError from "http-errors";
import type { User } from "@/models/User";
import { CreateOrganizationInviteRequest } from "@/util/validation";
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

export default class EmailService {
  public static async sendOrganizationInvitationEmail(
    request: CreateOrganizationInviteRequest,
    organization: Organization,
    user: User | null,
  ) {
    const { inviteeEmail: email, organizationId, role } = request;

    if (!process.env.VERIFICATION_TOKEN_SECRET) {
      logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
      throw createHttpError.InternalServerError("configuration-error");
    }

    const invitationCode = jwt.sign(
      {
        reason: "organization-invite",
        email,
        role,
        organizationId,
      },
      process.env.VERIFICATION_TOKEN_SECRET!,
      {
        expiresIn: "30d",
      },
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
      }),
    );
    return sendEmail({
      to: email,
      subject: "City Catalyst - Organization Invitation",
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
            }),
          );

          await sendEmail({
            to: user.email as string,
            subject: "City Catalyst - Project Creation",
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
              user, // pass the individual user to the template if needed
            }),
          );

          await sendEmail({
            to: user.email as string,
            subject: "City Catalyst - Project Deletion",
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
            }),
          );

          await sendEmail({
            to: user.email as string,
            subject: "City Catalyst - City Slots Changed",
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
              user, // pass the individual user to the template if needed
            }),
          );

          await sendEmail({
            to: user.email as string,
            subject: "City Catalyst - Account Frozen",
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
              user, // pass the individual user to the template if needed
            }),
          );

          await sendEmail({
            to: user.email as string,
            subject: "City Catalyst - Account Activated",
            html,
          });
        } catch (err) {
          logger.error(`Failed to send email to ${user.email}`);
        }
      }),
    );
  }
}
