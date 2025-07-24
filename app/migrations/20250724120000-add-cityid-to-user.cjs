"use strict";

const sql_up = `
  ALTER TABLE "User"
  ADD COLUMN default_city_id UUID NULL REFERENCES "City"(city_id);
`;

const sql_down = `
  ALTER TABLE "User"
  DROP COLUMN IF EXISTS default_city_id;
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
}; 