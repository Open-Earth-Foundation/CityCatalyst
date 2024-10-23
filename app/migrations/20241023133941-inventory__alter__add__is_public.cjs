"use strict";

const sql_up = `alter table "Inventory"
    add is_public boolean default FALSE;`;

const sql_down = `alter table "Inventory"
    drop column is_public;`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
