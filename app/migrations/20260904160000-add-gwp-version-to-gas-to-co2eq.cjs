"use strict";

/**
 * Add gwp_version to GasToCO2Eq so AR5 and AR6 factors can coexist.
 * Existing rows become ar5 (matches the historical seed).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "GasToCO2Eq",
        "gwp_version",
        {
          type: Sequelize.STRING(16),
          allowNull: false,
          defaultValue: "ar5",
        },
        { transaction },
      );

      // Replace gas-only PK with (gas, gwp_version).
      await queryInterface.removeConstraint("GasToCO2Eq", "GasToCO2Eq_pkey", {
        transaction,
      });
      await queryInterface.addConstraint("GasToCO2Eq", {
        fields: ["gas", "gwp_version"],
        type: "primary key",
        name: "GasToCO2Eq_pkey",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Keep only ar5 rows so gas stays unique under the old PK.
      await queryInterface.sequelize.query(
        `DELETE FROM "GasToCO2Eq" WHERE gwp_version <> 'ar5';`,
        { transaction },
      );

      await queryInterface.removeConstraint("GasToCO2Eq", "GasToCO2Eq_pkey", {
        transaction,
      });
      await queryInterface.removeColumn("GasToCO2Eq", "gwp_version", {
        transaction,
      });
      await queryInterface.addConstraint("GasToCO2Eq", {
        fields: ["gas"],
        type: "primary key",
        name: "GasToCO2Eq_pkey",
        transaction,
      });
    });
  },
};
