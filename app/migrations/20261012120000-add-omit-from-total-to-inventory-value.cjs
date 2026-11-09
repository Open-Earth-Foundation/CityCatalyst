"use strict";

/**
 * I.4.4 (energy generation supplied to the grid) stays stored, but BASIC and
 * BASIC+ totals leave it out. The flag is generic so another reference can be
 * omitted later without a new filter in every total query.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("InventoryValue", "omit_from_total", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(`
      UPDATE "InventoryValue"
      SET omit_from_total = true
      WHERE gpc_reference_number = 'I.4.4'
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("InventoryValue", "omit_from_total");
  },
};
