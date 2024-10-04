import { PATCH as updateUser } from "@/app/api/v0/user/route";
import { db } from "@/models";
import { UserAttributes } from "@/models/User";
import { beforeAll, afterAll, describe, it, expect } from "@jest/globals";
import { mockRequest, setupTests, testUserID } from "../helpers";

// Test Data
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
  beforeAll(async () => {
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

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should update a user", async () => {
    const req = mockRequest(userUpdate);
    const res = await updateUser(req, { params: {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();
    const user = await db.models.User.findOne({
      where: { userId: userData.userId },
    });
    expect(user).not.toBeNull();
    expect(user!.defaultInventoryId).toBe(inventoryId);
  });

  it("should not update a user with invalid data", async () => {
    const req = mockRequest(invalidUserUpdate);
    const res = await updateUser(req, { params: {} });
    expect(res.status).toBe(400);
    const user = await db.models.User.findOne({
      where: { userId: userData.userId },
    });
    expect(user).not.toBeNull();
    expect(user!.defaultInventoryId).not.toBe(
      invalidUserUpdate.defaultInventoryId,
    );
  });
});
