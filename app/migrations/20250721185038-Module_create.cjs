"use strict";

const sql_up = `
    CREATE TABLE "Module" (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        step TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        url TEXT,
        created         timestamp,
        last_updated    timestamp
    );
    CREATE INDEX idx_module_step ON "Module" (step);
    CREATE INDEX idx_module_name ON "Module" (name);
`;

const sql_down = `
    DROP INDEX IF EXISTS idx_module_step;
    DROP INDEX IF EXISTS idx_module_name;
    DROP TABLE IF EXISTS "Module";
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