import { PATCH as updateUser } from "@/app/api/v0/user/route";
import { db } from "@/models";
import { UserAttributes } from "@/models/User";
import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { mockRequest, setupTests, testUserID } from "../helpers";

const inventoryId = "dab66377-a4fc-46d2-9782-5a87282d39fa";

const userData: UserAttributes = {
  userId: testUserID,
  name: "TEST_USER_USER",
};

const userUpdate = {
  defaultInventoryId: inventoryId,
};

const invalidUserUpdate = {
  defaultInventoryId: "invalid",
};

describe("User API", () => {
  before(async () => {
    setupTests();
    await db.initialize();
    await db.models.Inventory.destroy({
      where: { inventoryId },
    });
    await db.models.User.upsert(userData);
    await db.models.Inventory.create({
      inventoryId,
      year: 3000,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should update a user", async () => {
    const req = mockRequest(userUpdate);
    const res = await updateUser(req, { params: {} });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    const user = await db.models.User.findOne({
      where: { userId: userData.userId },
    });
    assert.ok(user != null);
    assert.equal(user.defaultInventoryId, inventoryId);
  });

  it("should not update a user with invalid data", async () => {
    const req = mockRequest(invalidUserUpdate);
    const res = await updateUser(req, { params: {} });
    assert.equal(res.status, 400);
    const user = await db.models.User.findOne({
      where: { userId: userData.userId },
    });
    assert.ok(user != null);
    assert.notEqual(
      user.defaultInventoryId,
      invalidUserUpdate.defaultInventoryId,
    );
  });
});
