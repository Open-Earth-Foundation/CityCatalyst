import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import CDPService from "@/backend/CDPService";

const TEST_CITY = "Test City";
const TEST_COUNTRY = "Test Country";
const TEST_CITY_ID = "org-123";
const TEST_QUESTION = "1";
const TEST_RESPONSE = { rowId: "test", content: "Test response" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CDPService", () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    process.env.CDP_MODE = "test";
    process.env.CDP_API_KEY = "mock-cdp-api-key";
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be in test mode", () => {
    expect(CDPService.mode).toBe("test");
  });

  it("should get a city ID from CDP", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organizations: [
          { id: TEST_CITY_ID, name: TEST_CITY, country: TEST_COUNTRY },
        ],
      }),
    );

    const cityID = await CDPService.getCityID(TEST_CITY, TEST_COUNTRY);

    expect(cityID).toBe(TEST_CITY_ID);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-pre.cdpgreenstar.net/response/partner/organizations",
      expect.objectContaining({
        headers: expect.arrayContaining([
          ["subscription-key", "mock-cdp-api-key"],
        ]),
      }),
    );
  });

  it("should get questions from CDP", async () => {
    const questionnaire = {
      sections: [{ questions: [{ id: "q1", text: "Sample question" }] }],
    };
    fetchMock.mockResolvedValue(jsonResponse(questionnaire));

    const questions = await CDPService.getQuestions(TEST_CITY_ID);

    expect(questions).toEqual(questionnaire);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-pre.cdpgreenstar.net/response/questionnaire/questions",
      expect.objectContaining({
        headers: expect.arrayContaining([
          ["organization-id", TEST_CITY_ID],
          ["subscription-key", "mock-cdp-api-key"],
        ]),
      }),
    );
  });

  it("should submit a response to CDP", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 200));

    const response = await CDPService.submitMatrix(
      TEST_CITY_ID,
      TEST_QUESTION,
      [TEST_RESPONSE],
    );

    expect(response).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-pre.cdpgreenstar.net/response/response",
      expect.objectContaining({
        method: "PUT",
        headers: expect.arrayContaining([
          ["organization-id", TEST_CITY_ID],
          ["subscription-key", "mock-cdp-api-key"],
        ]),
      }),
    );
  });
});
