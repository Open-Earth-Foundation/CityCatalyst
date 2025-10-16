"use strict";

const sql_up = `
  alter table "HighImpactActionRanking"
    alter column job_id set not null;
`;

const sql_down = `
  alter table "HighImpactActionRanking"
    alter column job_id drop not null;
`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
