"use strict";

const sql_up = `CREATE TYPE inventory_type AS ENUM ('gpc_basic', 'gpc_basic_plus');
alter table "Inventory"
    add inventory_type inventory_type default 'gpc_basic' not null;
`;

const sql_down = `ALTER TABLE "Inventory"
    DROP COLUMN "inventory_type";`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
