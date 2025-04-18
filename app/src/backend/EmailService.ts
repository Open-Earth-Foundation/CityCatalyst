import createHttpError from "http-errors";
import type { User } from "@/models/User";
import { CreateOrganizationInviteRequest } from "@/util/validation";
import { Organization } from "@/models/Organization";
import jwt from "jsonwebtoken";
import { sendEmail } from "@/lib/email";
import { render } from "@react-email/components";
import InviteToOrganizationTemplate from "@/lib/emails/InviteToOrganizationTemplate";

export default class EmailService {
  public static async sendOrganizationInvitationEmail(
    request: CreateOrganizationInviteRequest,
    organization: Organization,
    user: User | null,
  ) {
    const { inviteeEmail: email, organizationId, role } = request;

    if (!process.env.VERIFICATION_TOKEN_SECRET) {
      console.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
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
    return sendEmail({
      to: email,
      subject: "City Catalyst - Organization Invitation",
      html: render(
        InviteToOrganizationTemplate({
          url,
          organization,
          user,
        }),
      ),
    });
  }
}
