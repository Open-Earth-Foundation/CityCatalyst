"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up() {
    // Disabled, now handled by Module seeder
    // await queryInterface.sequelize.query(sql_up);
  },

  async down() {
    // await queryInterface.sequelize.query(sql_down);
  },
};
