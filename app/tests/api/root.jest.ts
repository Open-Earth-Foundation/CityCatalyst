import { GET as getRootMessage } from "@/app/api/v0/route";
import { db } from "@/models";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { mockRequest, setupTests } from "../helpers";

describe("Root API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    await db.sequelize?.close();
  });

  describe("GET /api/v0", () => {
    it("should return welcome message", async () => {
      const req = mockRequest();
      const res = await getRootMessage(req, { params: Promise.resolve({}) });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("Welcome to the CityCatalyst backend API!");
    });
  });
});