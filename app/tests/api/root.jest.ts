import { GET as getRootMessage } from "@/app/api/v1/route";
import { db } from "@/models";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { expectStatusCode, mockRequest, setupTests } from "../helpers";

describe("Root API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.sequelize?.close();
  });

  describe("GET /api/v1", () => {
    it("should return welcome message", async () => {
      const req = mockRequest();
      const res = await getRootMessage(req, { params: Promise.resolve({}) });

      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.message).toBe("Welcome to the CityCatalyst backend API!");
    });
  });
});

