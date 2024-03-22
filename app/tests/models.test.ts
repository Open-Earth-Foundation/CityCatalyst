import { expect, describe, beforeAll, afterAll, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import "dotenv/config";

import { db } from "@/models";

const email = "test@openearth.org";

describe("Models", () => {
  beforeAll(async () => {
    await db.initialize();
    await db.models.User.destroy({ where: { email } });
  });

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  describe("User model", () => {
    it("should have unique emails", async () => {
      const user = await db.models.User.create({ userId: randomUUID(), email });
      expect(user.email).toEqual(email);
      await expect(() => {
        return db.models.User.create({ userId: randomUUID(), email });
      }).rejects.toThrowError();
    });
  });
});
