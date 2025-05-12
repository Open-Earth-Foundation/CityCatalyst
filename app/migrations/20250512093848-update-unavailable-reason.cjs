"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "InventoryValue"
      SET "unavailable_reason" = 'included-elsewhere'
      WHERE "unavailable_reason" = 'presented-elsewhere';
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "InventoryValue"
      SET "unavailable_reason" = 'presented-elsewhere'
      WHERE "unavailable_reason" = 'included-elsewhere';
    `);
  },
};
