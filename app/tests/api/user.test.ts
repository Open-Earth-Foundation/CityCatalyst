import { PATCH as updateUser } from "@/app/api/v0/user/route";
import { db } from "@/models";
import { UserAttributes } from "@/models/User";
import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { mockRequest, setupTests, testUserID } from "../helpers";

const userData: UserAttributes = {
  userId: testUserID,
  name: "TEST_USER_USER",
};

const userUpdate = {
  defaultCityLocode: "XX_USER_TEST",
  defaultInventoryYear: 3000,
};

describe("User API", () => {
  before(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.destroy({ where: { userId: userData.userId } });
    await db.models.User.create(userData);
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
    assert.equal(user.defaultCityLocode, userUpdate.defaultCityLocode);
    assert.equal(user.defaultInventoryYear, userUpdate.defaultInventoryYear);
  });

  it("should not update a user with invalid data", async () => {
    // TODO
  });
});
