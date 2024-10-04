import { after, before, beforeEach, describe, it, mock } from "node:test";

import { logger } from "@/services/logger";
import CDPService from "@/backend/CDPService";

import assert from "node:assert";

const TEST_CITY = "Test City";
const TEST_COUNTRY = "Test Country";
const TEST_QUESTION = "1";
const TEST_RESPONSE = ["Test response"];

describe.skip("CDPService", () => {
  let cityID: string | null = null;

  it("should be in test mode", () => {
    assert.equal(CDPService.mode, "test");
  });

  before(async () => {
    cityID = await CDPService.getCityID(TEST_CITY, TEST_COUNTRY);
  });

  it("should get a city ID from CDP", async () => {
    const testCityID = await CDPService.getCityID(TEST_CITY, TEST_COUNTRY);
    assert.notEqual(testCityID, null);
  });

  it("should get questions from CDP", async () => {
    const questions = await CDPService.getQuestions(cityID!);
    assert.notEqual(questions, null);
  });

  it("should submit a response to CDP", async () => {
    const response = await CDPService.submitMatrix(
      cityID!,
      TEST_QUESTION,
      TEST_RESPONSE,
    );
    assert.notEqual(response, null);
  });
});
