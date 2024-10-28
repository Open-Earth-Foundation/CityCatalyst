"use strict";

const sql_up = `alter table "Inventory"
    add published_at timestamp;`;

const sql_down = `alter table "Inventory"
    drop column published_at;`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
