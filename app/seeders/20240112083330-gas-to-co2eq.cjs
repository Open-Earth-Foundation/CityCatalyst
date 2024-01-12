"use strict";

const { parseFile, bulkUpsert } = require("./util/util.cjs");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const gwps = await parseFile("gwp");
    await queryInterface.sequelize.transaction(async (transaction) => {
      await bulkUpsert(queryInterface, "GasToCO2Eq", gwps, "gas", transaction);
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("GasToCO2Eq", null, { transaction });
    });
  },
};
