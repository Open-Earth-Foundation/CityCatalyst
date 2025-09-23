"use strict";

const sql_up = `
    ALTER TABLE "Module" 
    ADD COLUMN IF NOT EXISTS logo TEXT;
    
    ALTER TABLE "Module" 
    ALTER COLUMN created SET DEFAULT NOW();
    
    ALTER TABLE "Module" 
    ALTER COLUMN last_updated SET DEFAULT NOW();
`;

const sql_down = `
    ALTER TABLE "Module" 
    ALTER COLUMN created DROP DEFAULT;
    
    ALTER TABLE "Module" 
    ALTER COLUMN last_updated DROP DEFAULT;
    
    ALTER TABLE "Module" 
    DROP COLUMN IF EXISTS logo;
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
