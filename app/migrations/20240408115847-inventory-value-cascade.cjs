"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    return queryInterface.sequelize.query(`
      BEGIN;
      ALTER TABLE "GasValue" DROP CONSTRAINT "GasValue_emissions_factor_id_fkey";
      ALTER TABLE "GasValue" DROP CONSTRAINT "GasValue_inventory_value_id_fkey";
      COMMIT;
    `);
  },

  async down(queryInterface) {
    return queryInterface.sequelize.query(`
      BEGIN;
      ALTER TABLE "GasValue" ADD CONSTRAINT "GasValue_emissions_factor_id_fkey" FOREIGN KEY (emissions_factor_id) REFERENCES "EmissionsFactor"(id);
      ALTER TABLE "GasValue" ADD CONSTRAINT "GasValue_inventory_value_id_fkey" FOREIGN KEY (inventory_value_id) REFERENCES "InventoryValue"(id);
      COMMIT;
    `);
  },
};
