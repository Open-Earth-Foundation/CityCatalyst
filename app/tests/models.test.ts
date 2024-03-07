import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "dotenv/config";

import { db } from "@/models";

const email = "test@openearth.org";

describe("Models", () => {
  before(async () => {
    await db.initialize();
    await db.models.User.destroy({ where: { email } });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  describe("User model", () => {
    it("should have unique emails", async () => {
      const user = await db.models.User.create({ userId: randomUUID(), email });
      assert.equal(user.email, email);
      await assert.rejects(() => {
        return db.models.User.create({ userId: randomUUID(), email });
      });
    });
  });
});
