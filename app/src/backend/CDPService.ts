export default class CDPService {

  static get mode(): string {
    return process.env.CDP_MODE || "test";
  }

  static get key(): string {
    return process.env.CDP_API_KEY || "test-key";
  }

  private static url(relative: string): string {
    const host = (this.mode === "test") ? "api-pre" : "api-prd";
    return `https://${host}.cdpgreenstar.net/${relative}`;
  }

  public static async getCityID(city: string, country: string): Promise<string>  {
    const url = this.url("response/partner/organizations");
    const response = await fetch(url, {
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["subscription-key", this.key]
      ]
    });
    if (!response.ok) {
      throw new Error(`Failed to get city ID: ${response.statusText}`);
    }
    const data = await response.json();
    const organizations = data.organizations;
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
        ["subscription-key", this.key]
      ]
    });
    if (!response.ok) {
      throw new Error(`Failed to get questions: ${response.statusText}`);
    }
    return await response.json();
  }

  public static async submitResponse(cityID: string, question: string, response: string): Promise<boolean> {
    const url = this.url(`response/response`);
    const body = {
      id: question,
      "updateResponseInput": {
        "content": response,
        "status": "ANSWERED"
      }
    };
    const res = await fetch(url, {
      method: "PUT",
      headers: [
        ["user-agent", "CityCatalyst/0.10.0"],
        ["subscription-key", this.key],
        ["organization-id", cityID],
        ["content-type", "application/json"]
      ],
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`Failed to submit response: ${res.statusText}`);
    }
    const doc = await res.json();
    return doc.responseVersion === 0;
  }
}