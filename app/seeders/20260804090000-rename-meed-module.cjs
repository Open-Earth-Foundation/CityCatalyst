"use strict";

const { parseJsonFile, bulkUpsert } = require("./util/util.cjs");

const MEED_MODULE_ID = "9f622243-fba8-4f32-a000-ce6e66982bd1";

/**
 * Re-upserts the MEED module row so the display-name change in
 * seed-data/modules/modules.json reaches environments where the original
 * modules seeder (20250923103314) has already run. Sequelize records executed
 * seeders, so editing the JSON alone has no effect on an existing database.
 *
 * Only the display name / description / tagline change here — the module id,
 * url (/MEED) and stage are unchanged, so nothing downstream is affected.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const modules = await parseJsonFile("modules", "modules");
    const meedModule = modules.find((module) => module.id === MEED_MODULE_ID);

    if (!meedModule) {
      console.warn(
        `Module ${MEED_MODULE_ID} not found in seed data; skipping rename.`,
      );
      return;
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      await bulkUpsert(
        queryInterface,
        "Module",
        [
          {
            ...meedModule,
            name: JSON.stringify(meedModule.name),
            description: JSON.stringify(meedModule.description),
            tagline: JSON.stringify(meedModule.tagline),
          },
        ],
        "id",
        transaction,
        false,
        true, // insert timestamps if the row does not exist yet
      );
    });
  },

  async down() {
    // The previous display name is not recoverable from seed data, and the row
    // itself is owned by the modules seeder. Intentionally a no-op.
  },
};
