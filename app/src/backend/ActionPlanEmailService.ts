import { render } from "@react-email/components";
import ActionPlanReadyTemplate from "@/lib/emails/ActionPlanReadyTemplate";
import NotificationService from "@/backend/NotificationService";
import { User } from "@/models/User";
import { logger } from "@/services/logger";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export interface SendActionPlanEmailInput {
  user: User;
  actionName: string;
  cityName: string;
  language?: string;
  actionPlanUrl: string;
}

export default class ActionPlanEmailService {
  /**
   * Send email notification when action plan is ready
   */
  public static async sendActionPlanReadyEmail(
    input: SendActionPlanEmailInput,
  ): Promise<void> {
    try {
      const { user, actionName, cityName, language, actionPlanUrl } = input;

      logger.info({
        userId: user.userId,
        email: user.email,
        actionName,
        cityName,
        language,
      }, "Sending action plan ready email");

      // Get translations for the email subject
      const t = i18next.getFixedT(language || LANGUAGES.en, "emails");
      const subject = t("action-plan-ready.subject");

      logger.info({
        subject,
        hasUser: !!user,
        userEmail: user?.email,
        actionName,
        cityName,
      }, "Email subject and template data");

      // Render the email template with error handling
      let emailHtml: string;
      try {
        emailHtml = await render(
          ActionPlanReadyTemplate({
            user,
            actionName,
            cityName,
            language,
            url: actionPlanUrl,
          }),
        );
        logger.info("Email template rendered successfully");
      } catch (renderError) {
        logger.error({ err: renderError }, "Failed to render email template");
        // Fallback to simple HTML if template rendering fails
        emailHtml = `
          <html>
            <body>
              <h1>Your climate action plan is ready!</h1>
              <p>Hi ${user?.name || "there"},</p>
              <p>We've generated a draft implementation plan for the climate action '${actionName}' as requested. These guidelines will support your journey towards a low-carbon future.</p>
              <p>You can now view and explore your draft at the CityCatalyst platform.</p>
              <p>Click the button below to access your generated plans and explore each action in depth.</p>
              <p><a href="${actionPlanUrl}" style="background-color: #2351DC; color: white; padding: 16px; text-decoration: none; border-radius: 8px; display: inline-block;">View Action Plan</a></p>
              <p style="margin-top: 36px; border-top: 1px solid #EBEBEC; padding-top: 16px; font-size: 12px; color: #79797A;">Open Earth Foundation is a nonprofit public benefit corporation from California, USA. EIN: 85-3261449</p>
            </body>
          </html>
        `;
        logger.info("Using fallback email template");
      }

      // Send the email
      const result = await NotificationService.sendEmail({
        to: user.email || "",
        subject,
        text: `Your climate action plan is ready! We've generated a draft implementation plan for the climate action '${actionName}' as requested. You can now view and explore your draft at the CityCatalyst platform. View your plan at: ${actionPlanUrl}`,
        html: emailHtml,
      });

      if (result.success) {
        logger.info({
          userId: user.userId,
          email: user.email,
          actionName,
        }, "Action plan ready email sent successfully");
      } else {
        logger.error({ userId: user.userId, email: user.email, error: result.error }, "Failed to send action plan ready email");
      }
    } catch (error: any) {
      logger.error({ err: error }, "Error sending action plan ready email");
      // Don't throw error - email failure shouldn't break the action plan generation
    }
  }

  /**
   * Build the URL to view the action plan
   */
  public static buildActionPlanUrl(
    actionId: string,
    language: string = "en",
  ): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/${language}/cities/`;
  }

  /**
   * Send action plan ready email with automatic URL generation
   */
  public static async sendActionPlanReadyEmailWithUrl(
    user: User,
    actionName: string,
    cityName: string,
    actionId: string,
    language?: string,
  ): Promise<void> {
    const actionPlanUrl = this.buildActionPlanUrl(actionId, language || "en");

    await this.sendActionPlanReadyEmail({
      user,
      actionName,
      cityName,
      language,
      actionPlanUrl,
    });
  }
}
