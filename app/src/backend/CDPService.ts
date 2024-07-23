import { logger } from "@/services/logger";
import createHttpError from "http-errors";

export default class CDPService {
  static get mode(): string {
    return process.env.CDP_MODE || "disabled";
  }

  static get key(): string {
    if (!process.env.CDP_API_KEY) {
      logger.error("Missing CDP_API_KEY env var!");
    }
    return process.env.CDP_API_KEY || "test-key";
  }

  private static url(relative: string): string {
    const host = this.mode === "test" ? "api-pre" : "api-prd";
    return `https://${host}.cdpgreenstar.net/${relative}`;
  }

  public static async getCityID(
    city: string | undefined,
    country: string | undefined,
  ): Promise<string> {
    logger.info(`Getting city ID for ${city}, ${country}`);
    const url = this.url("response/partner/organizations");
    const response = await fetch(url, {
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["subscription-key", this.key],
      ],
    });
    if (!response.ok) {
      console.log(await response.text());
      throw createHttpError.BadRequest(
        `Failed to get city ID from CDP: ${response.statusText}`,
      );
    }
    const data = await response.json();
    const organizations = data.organizations;
    logger.info(`Got ${organizations.length} organizations`);
    logger.debug(`Organizations: ${JSON.stringify(organizations)}`);
    const cityOrg = organizations.find((org: any) => {
      return org.name === city && org.country === country;
    });
    if (!cityOrg) {
      throw new Error(`City not found: ${city}, ${country}`);
    }
    return cityOrg.id;
  }

  public static async getQuestions(cityID: string): Promise<any> {
    const url = this.url(`response/questionnaire/questions`);
    const response = await fetch(url, {
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["organization-id", cityID],
        ["subscription-key", this.key],
      ],
    });
    if (!response.ok) {
      throw new Error(`Failed to get questions: ${response.statusText}`);
    }
    return await response.json();
  }

  public static async submitSingleSelect(
    cityID: string,
    question: string,
    id: string,
    name: string,
  ): Promise<boolean> {
    const url = this.url(`response/response`);
    const body = [
      {
        id: question,
        updateResponseInput: {
          content: { name, id },
          status: "ANSWERED",
        },
      },
    ];
    logger.debug(`Submitting response: ${JSON.stringify(body)}`);
    const res = await fetch(url, {
      method: "PUT",
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["subscription-key", this.key],
        ["organization-id", cityID],
        ["content-type", "application/json"],
      ],
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.debug(`Failed to submit response: ${res.statusText}`);
      const text = await res.text();
      logger.debug(`Response: ${text}`);
      throw new Error(`Failed to submit response: ${res.statusText} (${text})`);
    }
    logger.debug(`Response: ${res.status}`);
    logger.debug(`Response: ${res.statusText}`);
    return true;
  }

  public static async submitMatrix(
    cityID: string,
    question: string,
    rows: { rowId: string; content: string }[],
  ): Promise<boolean> {
    const url = this.url(`response/response`);
    const body = rows.map((row) => {
      return {
        id: question,
        rowId: row.rowId,
        updateResponseInput: {
          content: row.content.toString(),
          status: "ANSWERED",
        },
      };
    });
    logger.debug(`Submitting response: ${JSON.stringify(body)}`);
    const res = await fetch(url, {
      method: "PUT",
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["subscription-key", this.key],
        ["organization-id", cityID],
        ["content-type", "application/json"],
      ],
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.debug(`Failed to submit response: ${res.statusText}`);
      const text = await res.text();
      logger.debug(`Response: ${text}`);
      throw new Error(`Failed to submit response: ${res.statusText} (${text})`);
    }
    logger.debug(`Response: ${res.status}`);
    logger.debug(`Response: ${res.statusText}`);
    return true;
  }
}
