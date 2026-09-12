"use strict";

const { parseFile, bulkUpsert } = require("./util/util.cjs");

/**
 * Seed GasToCO2Eq for AR5 and AR6 (GHG Protocol / IPCC GWP100 values).
 * Source: GHG Protocol GWP values sheet (AR5) and IPCC AR6 GWP100
 * as published via GHG Protocol / openclimatedata globalwarmingpotentials.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const gwps = await parseFile("gwp", "gwp");
    await queryInterface.sequelize.transaction(async (transaction) => {
      await bulkUpsert(
        queryInterface,
        "GasToCO2Eq",
        gwps,
        ["gas", "gwp_version"],
        transaction,
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("GasToCO2Eq", null, { transaction });
    });
  },
};
