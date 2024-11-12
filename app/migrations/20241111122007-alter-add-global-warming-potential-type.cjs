"use strict";

const sql_up = `CREATE TYPE global_warming_potential_type AS ENUM ('ar6', 'ar5');
alter table "Inventory"
    add global_warming_potential_type global_warming_potential_type default 'ar6' not null;
`;

const sql_down = `
  ALTER TABLE "Inventory"
    DROP COLUMN "global_warming_potential_type";
  DROP TYPE IF EXISTS global_warming_potential_type;
`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
