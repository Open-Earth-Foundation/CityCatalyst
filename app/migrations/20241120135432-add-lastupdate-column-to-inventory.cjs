"use strict";

const sql_up = `alter table "Inventory"
    add last_updated_at timestamp;`;

const sql_down = `alter table "Inventory"
    drop column last_updated_at;`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
