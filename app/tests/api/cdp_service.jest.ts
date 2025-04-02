import { beforeAll, describe, expect, it } from "@jest/globals";

import CDPService from "@/backend/CDPService";

const TEST_CITY = "Test City";
const TEST_COUNTRY = "Test Country";
const TEST_QUESTION = "1";
const TEST_RESPONSE = { rowId: "test", content: "Test response" };

describe.skip("CDPService", () => {
  let cityID: string | null = null;

  beforeAll(async () => {
    cityID = await CDPService.getCityID(TEST_CITY, TEST_COUNTRY);
  });

  it("should be in test mode", () => {
    expect(CDPService.mode).toBe("test");
  });

  it("should get a city ID from CDP", async () => {
    const testCityID = await CDPService.getCityID(TEST_CITY, TEST_COUNTRY);
    expect(testCityID).not.toBeNull();
  });

  it("should get questions from CDP", async () => {
    const questions = await CDPService.getQuestions(cityID!);
    expect(questions).not.toBeNull();
  });

  it("should submit a response to CDP", async () => {
    const response = await CDPService.submitMatrix(cityID!, TEST_QUESTION, [
      TEST_RESPONSE,
    ]);
    expect(response).not.toBeNull();
  });
});
