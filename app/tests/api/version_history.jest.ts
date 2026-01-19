import { GET as getVersionHistory } from "@/app/api/v1/inventory/[inventory]/version-history/route";
import { POST as restoreVersion } from "@/app/api/v1/inventory/[inventory]/version-history/restore/[version]/route";
import { db } from "@/models";
import { UserAttributes } from "@/models/User";
import { beforeAll, afterAll, describe, it, expect } from "@jest/globals";
import { mockRequest, setupTests, testUserID } from "../helpers";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

// Test Data
const inventoryId = "dab66377-a4fc-46d2-9782-5a87282d39fa";
const cityId = "1962df0f-8280-4ac8-aa32-c1e7184b3b38";
const cityUserId = "95e7c4e7-fc82-49bd-869b-480363677e99";
const userData: UserAttributes = {
  userId: testUserID,
  name: "TEST_USER_USER",
};

const userUpdate = {
  defaultInventoryId: inventoryId,
  defaultCityId: cityId,
};

const invalidUserUpdate = {
  defaultInventoryId: "invalid",
  defaultCityId: "invalid",
};

const emptyParams = { params: Promise.resolve({}) };

describe("Version History API", () => {
  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // First, update any users that might have this city as their default
    await db.models.User.update(
      { defaultCityId: null },
      { where: { defaultCityId: cityId } },
    );

    await db.models.Inventory.destroy({
      where: { inventoryId },
    });
    await db.models.City.destroy({ where: { cityId } });
    await db.models.CityUser.destroy({ where: { cityUserId } });
    await db.models.User.upsert(userData);
    await db.models.City.create({ cityId });
    await db.models.CityUser.create({ cityUserId, cityId, userId: testUserID });
    await db.models.Inventory.create({
      inventoryId,
      year: 3000,
      cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
  });

  afterAll(async () => {
    // Clean up in the correct order to avoid foreign key constraint violations
    await db.models.Inventory.destroy({
      where: { inventoryId },
    });

    // Update any users that might have this city as their default
    await db.models.User.update(
      { defaultCityId: null },
      { where: { defaultCityId: cityId } },
    );

    await db.models.CityUser.destroy({ where: { cityUserId } });
    await db.models.City.destroy({ where: { cityId } });

    if (db.sequelize) await db.sequelize.close();
  });

  /* it("should create a version history entry when adding an InventoryValue", async () => {
    // TODO implement
  }); */

  it("should allow retrieving the version history for an inventory", async () => {
    // TODO create and delete inventory data so there is a version history to query here
    const res = await getVersionHistory(mockRequest(), {
      params: Promise.resolve({
        inventory: inventoryId,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    console.log("VERSION HISTORY", data);
    // TODO confirm the history data is correctly created, previousVersionId has been correctly assigned to the entries where there was a version for the same ID in the same table etc.
  });

  it("should allow restoring a previous version", async () => {
    // TODO create and delete inventory data so there is a version to restore here
    const restoredVersionId = "82b7a7b6-61c1-4974-b8a7-65677a88e738"; // TODO get this from the Version table (older version that is supposed to be restored, but not the oldest one)

    const res = await restoreVersion(mockRequest(), {
      params: Promise.resolve({
        inventory: inventoryId,
        version: restoredVersionId,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();

    // TODO confirm the older version has been successfully restored (old data is back and deleted table entries have been re-added)
  });
});
