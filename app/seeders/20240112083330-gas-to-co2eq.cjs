"use strict";

const { parseFile, bulkUpsert } = require("./util/util.cjs");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const gwps = await parseFile("gwp", "gwp");
    await queryInterface.sequelize.transaction(async (transaction) => {
      await bulkUpsert(queryInterface, "GasToCO2Eq", gwps, "gas", transaction);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("GasToCO2Eq", null, { transaction });
    });
  },
};
