"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "InventoryValue"
      SET "unavailable_reason" = 'included-elsewhere'
      WHERE "unavailable_reason" = 'presented-elsewhere';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "InventoryValue"
      SET "unavailable_reason" = 'presented-elsewhere'
      WHERE "unavailable_reason" = 'included-elsewhere';
    `);
  },
};
